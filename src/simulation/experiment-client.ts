import {emptyBatch,validateBatch} from './uncertainty.ts';
import type {BatchInput,BatchState,BatchUpdate} from './uncertainty.ts';
import type {WorkerCommand,WorkerReply} from './worker.ts';
import {freezeConfiguration} from './scenario.ts';

type BatchPort={postMessage:(command:WorkerCommand)=>void;terminate:()=>void;onmessage:((e:MessageEvent<WorkerReply>)=>void)|null;onerror:((e:ErrorEvent)=>void)|null};
export class ExperimentClient{
  private state:BatchState=emptyBatch();
  private listeners=new Set<()=>void>();
  private worker:BatchPort|null=null;
  private generation=0;
  private factory:()=>BatchPort;
  constructor(factory:()=>BatchPort=()=>new Worker(new URL('./worker.ts',import.meta.url),{type:'module'})){this.factory=factory;}
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(next:BatchState){this.state=next;this.listeners.forEach(listener=>listener());}
  start(input:BatchInput){
    validateBatch(input);input=freezeConfiguration(structuredClone(input));this.worker?.terminate();
    const generation=++this.generation,worker=this.factory();this.worker=worker;
    this.publish({...emptyBatch(),status:'running',input,runs:input.seeds.map(()=>({}))});
    worker.onmessage=({data})=>{if(generation!==this.generation||!data.experiment)return;this.receive(data.experiment);
      if(data.experiment.done){worker.terminate();this.worker=null;}};
    worker.onerror=e=>{if(generation!==this.generation)return;this.cancel('failed',e.message);};
    worker.postMessage({type:'experiment',runId:`batch-${generation}`,requestId:1,input});
  }
  private receive(update:BatchUpdate){
    let {references,runs}=this.state;
    if(update.outcome&&update.active){const {side,index,reference}=update.active;
      const outcome=freezeConfiguration(update.outcome);
      if(reference)references={...references,[side]:outcome};else runs=runs.map((row,i)=>i===index?{...row,[side]:outcome}:row);
    }
    this.publish({...this.state,references,runs,active:update.active,elapsedMs:update.elapsedMs,maxSliceMs:update.maxSliceMs,status:update.done?'complete':'running'});
  }
  cancel(status:'cancelled'|'failed'='cancelled',error=''){
    if(this.state.status!=='running')return;
    ++this.generation;this.worker?.terminate();this.worker=null;
    const {active}=this.state;let {runs,references}=this.state;
    if(active){const partial={seed:active.seed,status,complete:false,cutoff:active.instant,digest:'',eventCount:0,metrics:null,draws:[],error:error||'Cancelled before a result was committed.'};
      if(active.reference){if(!references[active.side])references={...references,[active.side]:partial};}
      else if(!runs[active.index][active.side])runs=runs.map((row,i)=>i===active.index?{...row,[active.side]:partial}:row);
    }
    this.publish({...this.state,runs,references,status,error});
  }
  dispose(){this.cancel();this.worker?.terminate();this.worker=null;this.listeners.clear();}
}
