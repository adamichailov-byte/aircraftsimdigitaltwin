import {FleetEngine} from './flow.ts';
import type {FleetConfig,FleetSnapshot} from './flow.ts';
import {activityTimes,masterPlan} from './schedule.ts';
import type {ActivityTimes,MasterPlan} from './schedule.ts';
import type {FlowEvent} from './flow.ts';
export type WorkerCommand={runId:string;requestId:number;type:'start';config:FleetConfig}
  |{runId:string;requestId:number;type:'plan';config:FleetConfig}
  |{runId:string;requestId:number;type:'advance'|'run'|'event'|'operation'|'blocked-example'|'material-example'|'resource-example'|'logistics-example'|'outage-example'|'rework-example'|'cancel';target?:number};
export type WorkerReply={runId:string;requestId:number;snapshot?:FleetSnapshot;plan?:MasterPlan;actual?:ActivityTimes;events?:readonly FlowEvent[];done:boolean;state:'idle'|'computing'|'cancelled'|'failed';error?:string};

let engine:FleetEngine|null=null,generation=0,sentEventCount=0;
function exampleReady(command:WorkerCommand,snapshot:FleetSnapshot){
  return command.type==='blocked-example'?['bay-1','bay-2'].every(slot=>snapshot.aircraft.some(a=>a.slot===slot&&a.state==='blocked'))
    :command.type==='outage-example'?snapshot.aircraft.some(a=>a.pilot.tasks.some(task=>task.taskId==='wings'&&task.state==='paused-equipment'))
    :command.type==='rework-example'?snapshot.aircraft.some(a=>a.pilot.tasks.some(task=>task.qualityStatus==='failed')
      &&a.pilot.tasks.some(task=>task.qualityStatus==='repair'&&(task.state==='running'||task.state==='complete')))
    :command.type==='material-example'?snapshot.aircraft.some(a=>a.pilot.tasks.some(t=>t.taskId==='engines'&&t.state==='waiting-material'))
    :command.type==='logistics-example'?snapshot.logistics.jobs.some(j=>j.sku==='engine'&&j.stage==='inspection'&&j.inspectionNotBefore>snapshot.instant)
    :command.type==='resource-example'&&snapshot.aircraft.some(a=>a.pilot.tasks.some(t=>t.state==='waiting-resource'
      &&(t.resourceBlockers??[]).some(reason=>reason.includes('quality crew'))
      &&a.tasks.find(definition=>definition.id===t.taskId)?.label.toLowerCase().includes('inspect')))
      &&snapshot.resources.allocations.some(allocation=>allocation.crews.filter(unit=>unit.pool==='quality').length===2
        &&snapshot.aircraft.find(a=>a.id===allocation.serialId)?.tasks.find(task=>task.id===allocation.taskId)?.label.toLowerCase().includes('inspect'));
}
function send(reply:WorkerReply){
  if(engine?.runId===reply.runId&&reply.snapshot){
    const all=engine.getEvents(),events=all.slice(sentEventCount);sentEventCount=all.length;
    self.postMessage({...reply,events,...(reply.done?{actual:activityTimes(all)}:{})});return;
  }
  self.postMessage(reply);
}
self.onmessage=(event:MessageEvent<WorkerCommand>)=>{
  const command=event.data;
  if(command.type==='cancel'){
    if(engine?.runId!==command.runId)return;
    generation++;send({runId:command.runId,requestId:command.requestId,snapshot:engine?.getSnapshot(),done:true,state:'cancelled'});return;
  }
  const current=++generation;
  try {
    if(command.type==='start'){
      engine=new FleetEngine(command.config,command.runId);sentEventCount=0;
      send({runId:command.runId,requestId:command.requestId,snapshot:engine.getSnapshot(),done:true,state:'idle'});return;
    }
    if(command.type==='plan'){
      const referenceConfig={...command.config,...command.config.scheduleReference,
        disruptions:command.config.disruptions?{...command.config.disruptions,quality:{...command.config.disruptions.quality,failureProbabilityByTask:{}}}:undefined};
      const reference=new FleetEngine(referenceConfig,`${command.runId}-plan`);
      // Forecasts use the real capacity/route/material dispatcher, in bounded worker slices.
      // They never advance the actual engine or enter its event ledger.
      const planBatch=()=>{
        if(current!==generation)return;
        try{
          reference.advanceTo(command.config.recipe.end,32);
          if(reference.getSnapshot().nextEventInstant!==null){setTimeout(planBatch,0);return;}
          self.postMessage({runId:command.runId,requestId:command.requestId,
            plan:masterPlan(command.config,reference.getEvents(),reference.getSnapshot()),done:true,state:'idle'});
        }catch(error){send({runId:command.runId,requestId:command.requestId,done:true,state:'failed',error:String(error)});}
      };
      planBatch();return;
    }
    if(!engine||engine.runId!==command.runId)return;
    const initialOperations=engine.getSnapshot().operationCount;
    const target=command.target??engine.config.recipe.end;
    let lastPublish=performance.now();
    const batch=()=>{
      if(current!==generation||!engine)return;
      try {
        const began=performance.now();let count=0;
        if(command.type==='run'||command.type==='advance')engine.advanceTo(target,32);
        else while(count++<32&&performance.now()-began<12){
          const before=engine.getSnapshot();
          if(before.nextEventInstant===null||before.instant>=target)break;
          engine.advanceTo(Math.min(target,before.nextEventInstant),1);
          const snapshot=engine.getSnapshot();
          if(command.type==='event'||(command.type==='operation'&&snapshot.operationCount>initialOperations))break;
          if(exampleReady(command,snapshot))break;
        }
        if(engine.getSnapshot().status==='complete'&&(command.type==='run'||command.type==='advance'))engine.advanceTo(target);
        const snapshot=engine.getSnapshot();
        const done=snapshot.nextEventInstant===null||snapshot.instant>=target||command.type==='event'
          ||(command.type==='operation'&&snapshot.operationCount>initialOperations)||exampleReady(command,snapshot);
        if(done||performance.now()-lastPublish>=100){send({runId:command.runId,requestId:command.requestId,snapshot,done,state:done?'idle':'computing'});lastPublish=performance.now();}
        if(!done)setTimeout(batch,0);
      }catch(error){send({runId:command.runId,requestId:command.requestId,done:true,state:'failed',error:String(error)});}
    };
    batch();
  }catch(error){send({runId:command.runId,requestId:command.requestId,done:true,state:'failed',error:String(error)});}
};
