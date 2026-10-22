import {SimulationClock} from './clock.ts';
import type {FleetConfig,FleetSnapshot} from './flow.ts';
import {fleetRoutes} from './flow.ts';
import type {WorkerCommand,WorkerReply} from './worker.ts';
import type {ActivityTimes,MasterPlan} from './schedule.ts';
import {HistoryArchive,historyActivityTimes,historyCheckpointAt,nearestHistoryCheckpoint,projectHistory} from './history.ts';
import type {HistoryLedger} from './history.ts';
import {freezeConfiguration} from './scenario.ts';
import {recordRun} from './compare.ts';
import type {RecordedRun} from './compare.ts';
import {ExperimentClient} from './experiment-client.ts';

export type FleetView={fleet:FleetSnapshot|null;displayFleet:FleetSnapshot|null;plan:MasterPlan|null;planState:'building'|'ready'|'failed';actual:ActivityTimes;displayActual:ActivityTimes;
  history:HistoryLedger;state:'starting'|'idle'|'computing'|'cancelled'|'failed';error:string;runId:string;progressInstant:number|null};
type WorkerPort={postMessage:(command:WorkerCommand)=>void;terminate:()=>void;onmessage:((event:MessageEvent<WorkerReply>)=>void)|null;onerror:((event:ErrorEvent)=>void)|null};
/** A single outstanding job and a coalesced playback target bound the queue.
 * Run + request IDs reject late replies, including post-reset messages. */
export class FleetClient {
  readonly clock:SimulationClock;
  readonly experiments=new ExperimentClient();
  config:FleetConfig;
  baseline:RecordedRun|null=null;
  freezeBaseline(){
    if(this.view.state!=='idle')throw new RangeError('Finish the current calculation before freezing a baseline.');
    this.baseline=recordRun(this.config,this.view.fleet,this.view.history.events);
    this.publish({...this.view});
  }
  clearBaseline(){this.baseline=null;this.publish({...this.view});}
  private worker:WorkerPort|null=null;
  private planner:WorkerPort|null=null;
  private listeners=new Set<()=>void>();
  private run=0;
  private request=0;
  private activeRequest=0;
  private busy=false;
  private suppressClock=false;
  private pendingTarget:number|null=null;
  private afterStart:'blocked-example'|'material-example'|'resource-example'|'logistics-example'|'outage-example'|'rework-example'|null=null;
  private deferred:(()=>void)|null=null;
  private archive:HistoryArchive;
  private historyCursor:number|null=null;
  private view:FleetView={fleet:null,displayFleet:null,plan:null,planState:'building',actual:{},displayActual:{},history:{events:[],checkpoints:[],cursor:null},state:'starting',error:'',runId:'',progressInstant:null};
  private factory:()=>WorkerPort;
  constructor(config:FleetConfig,factory:()=>WorkerPort=()=>new Worker(new URL('./worker.ts',import.meta.url),{type:'module'})){
    this.config=config;this.factory=factory;
    this.archive=new HistoryArchive(config.eventLimit);
    this.clock=new SimulationClock(config.recipe.start,config.recipe.end);
    this.clock.subscribe(()=>{
      const instant=this.clock.getSnapshot().instant;
      if(!this.suppressClock&&this.view.fleet&&instant>this.view.fleet.instant)this.advance(instant);
    });
  }
  getSnapshot=()=>this.view;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(next:FleetView){this.view=next;this.listeners.forEach(listener=>listener());}
  private withHistory(base:Omit<FleetView,'displayFleet'|'displayActual'|'history'>):FleetView{
    const history=this.archive.snapshot(this.historyCursor),checkpoint=this.historyCursor===null?null:historyCheckpointAt(history,this.historyCursor);
    const displayFleet=checkpoint?projectHistory(checkpoint,history.events):base.fleet;
    const displayActual=this.historyCursor===null?base.actual:historyActivityTimes(history,this.historyCursor);
    return {...base,displayFleet,displayActual,history};
  }
  /** Pin the UI to an exact recorded state without advancing or replaying the engine. */
  setHistoryCursor(instant:number|null){
    this.play(false);
    if(instant===null)this.historyCursor=null;
    else if(historyCheckpointAt(this.archive.snapshot(null),instant))this.historyCursor=instant;
    else return false;
    this.publish(this.withHistory(this.view));return true;
  }
  /** Event rows may fall between checkpoints; seek to the closest earlier recorded state. */
  seekHistoryAtOrBefore(instant:number){
    const checkpoint=nearestHistoryCheckpoint(this.archive.snapshot(null),instant);
    return checkpoint?this.setHistoryCursor(checkpoint.instant):false;
  }
  returnToLive(){return this.setHistoryCursor(null);}
  start(){this.reset(this.config);}
  private pauseClock(){this.suppressClock=true;this.clock.setPlaying(false);this.suppressClock=false;}
  reset(config=this.config,example:'blocked-example'|'material-example'|'resource-example'|'logistics-example'|'outage-example'|'rework-example'|null=null){
    this.experiments.cancel();
    this.pauseClock();this.worker?.terminate();this.worker=null;this.planner?.terminate();this.planner=null;
    this.config=freezeConfiguration(structuredClone(config));config=this.config;this.pendingTarget=null;this.deferred=null;this.afterStart=example;
    this.archive=new HistoryArchive(config.eventLimit);this.historyCursor=null;
    this.publish(this.withHistory({fleet:null,plan:null,planState:'building',actual:{},state:'starting',error:'',runId:`fleet-${++this.run}`,progressInstant:null}));this.clock.reset(config.recipe.start,config.recipe.end);
    this.worker=this.factory();this.worker.onmessage=event=>this.receive(event.data);
    this.worker.onerror=event=>{this.busy=false;this.pauseClock();this.publish({...this.view,state:'failed',error:event.message});};
    this.send({type:'start',config});
    this.buildPlan();
  }
  private buildPlan(){
    const runId=this.view.runId,planner=this.factory();this.planner=planner;
    planner.onmessage=({data:reply})=>{
      if(this.planner!==planner||reply.runId!==this.view.runId||reply.requestId!==0)return;
      // A forecast is a separate result. It cannot replace actual state or its ledger.
      if(reply.plan)this.publish({...this.view,plan:reply.plan,planState:'ready'});
      else if(reply.state==='failed')this.publish({...this.view,planState:'failed'});
      if(reply.done){planner.terminate();this.planner=null;}
    };
    planner.onerror=()=>{planner.terminate();if(this.planner===planner){this.planner=null;this.publish({...this.view,planState:'failed'});}};
    planner.postMessage({type:'plan',config:this.config,runId,requestId:0});
  }
  /** Public for the transport boundary test; does not interpret old-run payloads. */
  receive(reply:WorkerReply){
    if(reply.runId!==this.view.runId)return;
    // Worker messages are ordered. Cancellation supersedes the displayed request,
    // but its preceding same-run event delta must still reach the retained ledger.
    if(reply.requestId!==this.activeRequest){if(reply.requestId<this.activeRequest)this.archive.append(reply.events??[]);return;}
    this.archive.append(reply.events??[]);
    if(reply.snapshot)this.archive.record(reply.snapshot,this.historyCursor);
    // Progress is not a new displayed world. Committing every calculation batch
    // would synchronously rebuild many intermediate airframes on the UI thread.
    // Scene, camera and inspector all retain one consistent view until done.
    if(!reply.done){this.publish(this.withHistory({...this.view,state:reply.state,progressInstant:reply.snapshot?.instant??null}));return;}
    this.publish(this.withHistory({...this.view,fleet:reply.snapshot??this.view.fleet,plan:reply.plan??this.view.plan,actual:reply.actual??this.view.actual,state:reply.state,error:reply.error??'',progressInstant:null}));
    this.busy=false;
    if(reply.state==='failed'){this.pendingTarget=null;this.pauseClock();return;}
    if(this.deferred){const command=this.deferred;this.deferred=null;command();return;}
    if(this.afterStart){const type=this.afterStart;this.afterStart=null;this.command(type);return;}
    if(this.pendingTarget!==null){const target=this.pendingTarget;this.pendingTarget=null;this.advance(target);}
  }
  private send(message:{type:'start';config:FleetConfig}|{type:Exclude<WorkerCommand['type'],'start'|'plan'>;target?:number}){
    if(!this.worker)return;
    this.busy=true;this.activeRequest=++this.request;
    this.worker.postMessage({...message,runId:this.view.runId,requestId:this.activeRequest} as WorkerCommand);
  }
  advance(target:number){
    if(!this.worker||!this.view.fleet||target<=this.view.fleet.instant)return;
    if(this.busy){this.pendingTarget=Math.max(this.pendingTarget??0,target);return;}
    this.send({type:'advance',target});
  }
  command(type:'event'|'operation'|'run'|'blocked-example'|'material-example'|'resource-example'|'logistics-example'|'outage-example'|'rework-example'){
    this.pauseClock();this.pendingTarget=null;
    if(this.busy){this.deferred=()=>this.command(type);return;}
    this.publish({...this.view,state:'computing'});
    this.send({type});
  }
  cancel(){
    this.pauseClock();this.pendingTarget=null;this.afterStart=null;this.deferred=null;
    this.send({type:'cancel'});
  }
  stepTow(id:string){
    this.pauseClock();this.pendingTarget=null;
    if(this.busy){this.deferred=()=>this.stepTow(id);return;}
    const fleet=this.view.fleet,transfer=fleet?.transfers.find(t=>t.serialId===id);if(!fleet||!transfer)return;
    let next=transfer.start;
    for(const phase of fleetRoutes[transfer.routeId].phases){next+=phase.durationMs;if(next>fleet.instant){this.send({type:'advance',target:Math.min(next,this.config.recipe.end)});return;}}
  }
  play(playing:boolean){
    if(this.view.fleet&&this.clock.getSnapshot().instant!==this.view.fleet.instant)this.clock.seek(this.view.fleet.instant);
    this.clock.setPlaying(playing);
  }
  dispose(){this.experiments.dispose();this.pauseClock();this.worker?.terminate();this.worker=null;this.planner?.terminate();this.planner=null;this.busy=false;}
}
