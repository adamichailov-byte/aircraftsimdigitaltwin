import type {FleetSnapshot} from './flow.ts';

/** Read-only scene projection. Issued kits represent work in use, never extra inventory. */
export function stationPresentation(fleet:FleetSnapshot|null,stationId:string){
  const recipeStation=stationId==='delivery-2'?'delivery':stationId;
  const aircraft=fleet?.aircraft.find(a=>a.slot===stationId&&a.state!=='transferring'&&a.state!=='delivered');
  const tasks=aircraft?.pilot.tasks.filter(t=>aircraft.tasks.some(d=>d.id===t.taskId&&d.stationId===recipeStation&&d.kind!=='transfer'))??[];
  const running=tasks.filter(t=>t.state==='running');
  const blocked=tasks.find(t=>['waiting-material','paused-equipment','quality-hold','waiting-resource'].includes(t.state));
  const current=running[0]??blocked??tasks.find(t=>t.startedAt!==null&&t.state!=='complete')??tasks.find(t=>t.state!=='complete');
  const leases=fleet?.resources.allocations.filter(a=>a.serialId===aircraft?.id&&running.some(t=>t.taskId===a.taskId))??[];
  const crewCount=leases.reduce((n,a)=>n+a.crews.length,0);
  const kitInUse=!!fleet?.inventory.reservations.some(r=>r.serialId===aircraft?.id&&r.state==='issued'
    &&tasks.some(t=>t.taskId===r.taskId&&t.startedAt!==null&&t.state!=='complete'));
  // A normal shared-resource queue is not itself an alarm; existing plan alerts handle lateness.
  const tone:'blocked'|'working'|'idle'=blocked&&blocked.state!=='waiting-resource'?'blocked':running.length?'working':'idle';
  const detail=blocked?[...(blocked.materialBlockers??[]),...(blocked.resourceBlockers??[]),...blocked.waitingFor].join(' · ')
    :current?.state==='paused-off-shift'?'Off shift':current?.state==='waiting-day-window'?'Next daily start window'
    :aircraft?.reasons.join(' · ')||(!current&&aircraft?'Ready for next station':'');
  return {serialId:aircraft?.id??null,crewCount,kitInUse,tone,
    activity:current?.label??(aircraft?'Station complete':'Standby'),detail,
    taskCount:running.length};
}

/** Paused/history poses are reconstructed from remaining work, not previous rendered frames. */
export function equipmentProgress(fleet:FleetSnapshot|null,stationId:string,equipment:string,elapsedWorkMs=0,taskPrefix?:string){
  const aircraft=fleet?.aircraft.find(a=>a.slot===stationId);if(!aircraft||aircraft.state==='transferring')return null;
  const task=aircraft.pilot.tasks.find(t=>t.startedAt!==null&&t.state!=='complete'&&aircraft.tasks.some(d=>
    d.id===t.taskId&&d.stationId===stationId&&d.equipmentRequirements?.[equipment]&&(!taskPrefix||d.id.startsWith(taskPrefix))));
  const definition=aircraft.tasks.find(d=>d.id===task?.taskId);if(!task||!definition)return null;
  const assigned=!!fleet?.resources.allocations.some(a=>a.serialId===aircraft.id&&a.taskId===task.taskId&&a.equipment.some(u=>u.pool===equipment));
  const working=task.state==='running'&&assigned;
  return {working,progress:Math.max(0,Math.min(0.999,(definition.durationMs-task.remainingWorkMs+(working?elapsedWorkMs:0))/definition.durationMs))};
}
