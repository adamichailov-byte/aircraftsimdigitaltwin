import type {FleetAircraft} from './flow.ts';
import {activityId,lateAircraftActivities} from './schedule.ts';
import type {ActivityTimes,MasterPlan} from './schedule.ts';

export type AircraftAlert={kind:'parts'|'crew'|'equipment'|'quality'|'flow'|'schedule';label:string;detail:string};

/** Keep the surface cue short while preserving the exact blocker for the inspector. */
export function aircraftAlert(reasons:readonly string[],lateActivities=0,flowBuffered=false,plannedWait=false):AircraftAlert|null{
  const routineFlow=/^Waiting for (downstream space · |a tow tug$|reserved transfer corridor$|kit forklift corridor reservation$|a staffed working period$)/;
  const reason=reasons.find(reason=>{
    if(flowBuffered&&routineFlow.test(reason))return false;
    if(plannedWait&&lateActivities===0&&(routineFlow.test(reason)||reason.startsWith('Waiting for ')&&(reason.includes(' crew · ')||reason.includes(' equipment · ')&&!reason.toLowerCase().includes('outage'))))return false;
    return true;
  });
  if(!reason)return lateActivities>0?{kind:'schedule',label:'BEHIND PLAN',detail:`${lateActivities} ${lateActivities===1?'activity':'activities'} overdue`}:null;
  const alert=reason.startsWith('Quality hold · ')?{kind:'quality' as const,label:'QUALITY HOLD',detail:reason.slice('Quality hold · '.length)}
    :reason.startsWith('Waiting for material · ')?{kind:'parts' as const,label:'PARTS',detail:reason.slice('Waiting for material · '.length)}
    :reason.startsWith('Waiting for ')&&reason.includes(' crew · ')?{kind:'crew' as const,label:'CREW',detail:reason.slice('Waiting for '.length)}
    :reason.startsWith('Waiting for ')&&reason.includes(' equipment · ')?{kind:'equipment' as const,label:'EQUIPMENT',detail:reason.slice('Waiting for '.length)}
    :{kind:'flow' as const,label:'FLOW',detail:reason.replace(/^Waiting for /,'')};
  return lateActivities>0?{...alert,label:`${alert.label} · ${lateActivities} LATE`,detail:`${alert.detail}; ${lateActivities} scheduled ${lateActivities===1?'activity':'activities'} overdue`}:alert;
}

/** A finite-capacity forecast includes queues and shared crew handoffs, not just productive work. */
export function aircraftStatusAlert(aircraft:FleetAircraft,plan:MasterPlan|null,actual:ActivityTimes,now:number){
  const late=lateAircraftActivities(plan,actual,now,aircraft.id).length;
  const waiting=aircraft.pilot.tasks.filter(task=>task.waitingFor.length===0
    &&(task.state==='waiting-resource'||task.state==='pending'&&task.startedAt===null));
  const plannedWait=!!plan&&waiting.length>0&&waiting.every(task=>{
    const row=plan.activities.find(row=>row.id===activityId('aircraft',aircraft.id,task.taskId));
    const due=task.startedAt===null?row?.start:row?.finish;
    return due!=null&&now<=due;
  });
  return aircraftAlert(aircraft.reasons,late,aircraft.flowBuffered,plannedWait);
}
