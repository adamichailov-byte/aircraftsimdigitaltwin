import type {FleetConfig,FlowEvent,FleetSnapshot} from './flow.ts';

export const handlingStages=['inspection','kitting','loading','transit','unloading','returning'] as const;
export type ActivityTime={start:number|null;finish:number|null};
export type ActivityTimes=Record<string,ActivityTime>;
export type PlannedActivity=ActivityTime&{id:string;owner:string;kind:'aircraft'|'receiving'|'equipment';label:string;station:string;resources:readonly string[]};
export type MasterPlan={label:string;activities:readonly PlannedActivity[];diagnosis:string;end:number};
export function activityId(kind:PlannedActivity['kind'],owner:string,task:string){return `${kind}/${owner}/${task}`;}

/** Full event log only: inspector history is deliberately truncated and cannot be a ledger. */
export function activityTimes(events:readonly FlowEvent[]):ActivityTimes{
  const result:ActivityTimes={};
  for(const event of events){
    if(event.kind==='equipment-outage-started'||event.kind==='equipment-outage-ended'){
      if(!event.taskId)continue;
      const id=activityId('equipment',event.serialId,event.taskId),time=result[id]??(result[id]={start:null,finish:null});
      if(event.kind==='equipment-outage-started')time.start=event.instant;else time.finish=event.instant;
      continue;
    }
    const handling=event.handling;
    const start=event.kind===(handling?'handling-started':'task-started');
    const finish=event.kind===(handling?'handling-completed':'task-completed');
    if((!start&&!finish)||(!handling&&!event.taskId))continue;
    const id=activityId(handling?'receiving':'aircraft',handling?.jobId??event.serialId,handling?.stage??event.taskId!);
    const time=result[id]??(result[id]={start:null,finish:null});
    // Handling emits another start when a paused stage reacquires its crew.
    if(start&&time.start===null)time.start=event.instant;
    if(finish)time.finish=event.instant;
  }
  return result;
}
function requirements(crews:Readonly<Record<string,number>>,equipment:Readonly<Record<string,number>>={}){
  return [...Object.entries(crews).map(([name,n])=>`${name} crew ×${n}`),...Object.entries(equipment).map(([name,n])=>`${name} ×${n}`)];
}
export function masterPlan(config:FleetConfig,events:readonly FlowEvent[],snapshot:FleetSnapshot):MasterPlan{
  const times=activityTimes(events),activities:PlannedActivity[]=[];
  const add=(row:Omit<PlannedActivity,'start'|'finish'>&Partial<ActivityTime>)=>activities.push({...row,...(times[row.id]??{start:row.start??null,finish:row.finish??null})});
  for(const order of config.orders)for(const task of snapshot.aircraft.find(a=>a.id===order.serialId)?.tasks??config.recipe.tasks)add({id:activityId('aircraft',order.serialId,task.id),owner:order.serialId,
    kind:'aircraft',label:task.label,station:task.stationId??'Plant',resources:requirements(task.crewRequirements,task.equipmentRequirements)});
  for(const outage of config.resources.outages??[]){const id=activityId('equipment',outage.equipmentId,outage.id);
    add({id,owner:outage.equipmentId,kind:'equipment',label:`Scheduled outage · ${outage.id}`,station:'Equipment maintenance',
      resources:[`${outage.equipmentId.replaceAll('-',' ')} outage`],start:outage.start,finish:outage.end});}
  for(const receipt of config.materials.receipts)for(const stage of handlingStages)add({id:activityId('receiving',receipt.id,stage),owner:receipt.id,
    kind:'receiving',label:`${receipt.lot.sku} · ${stage}`,station:stage==='unloading'?'Central stores':'Receiving / service route',
    resources:requirements({logistics:stage==='inspection'?2:1},['loading','transit','unloading','returning'].includes(stage)?{'kit-forklift':1}:{})});
  activities.sort((a,b)=>(a.start??Infinity)-(b.start??Infinity)||a.id.localeCompare(b.id));
  return {label:config.scheduleReference?.label??'Frozen plan · current run inputs',activities,diagnosis:snapshot.diagnosis,end:config.recipe.end};
}
export function scheduleState(row:PlannedActivity,actual:ActivityTime|undefined,now:number){
  if(actual?.finish!=null)return {state:'complete' as const,late:row.finish!=null&&actual.finish>row.finish,delay:row.finish==null?0:Math.max(0,actual.finish-row.finish)};
  const due=actual?.start!=null?row.finish:row.start;
  const startDelay=actual?.start!=null&&row.start!=null?Math.max(0,actual.start-row.start):0;
  const delay=Math.max(startDelay,due!=null?now-due:0),overdue=delay>0;
  return {state:overdue?'overdue' as const:actual?.start!=null?'active' as const:'planned' as const,late:overdue,delay};
}

export function lateAircraftActivities(plan:MasterPlan|null,actual:ActivityTimes,now:number,serialId:string){
  if(!plan)return[];
  return plan.activities.filter(row=>row.kind==='aircraft'&&row.owner===serialId).map(row=>({row,status:scheduleState(row,actual[row.id],now)}))
    .filter(item=>item.status.late);
}

/** Future receipts are visible jobs too; absent handling work is not a broken vehicle. */
export function receivingQueue(config:FleetConfig,fleet:FleetSnapshot){
  return config.materials.receipts.map(receipt=>{const job=fleet.logistics.jobs.find(j=>j.id===receipt.id);
    return {receipt,job,status:job?`${job.stage} · ${job.state}`:'Scheduled · awaiting arrival'};
  }).sort((a,b)=>Number(a.job?.stage==='complete')-Number(b.job?.stage==='complete')||a.receipt.at-b.receipt.at||a.receipt.id.localeCompare(b.receipt.id));
}
