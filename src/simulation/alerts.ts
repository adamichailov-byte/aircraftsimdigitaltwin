export type AircraftAlert={kind:'parts'|'crew'|'equipment'|'quality'|'flow'|'schedule';label:string;detail:string};

/** Keep the surface cue short while preserving the exact blocker for the inspector. */
export function aircraftAlert(reasons:readonly string[],lateActivities=0):AircraftAlert|null{
  const reason=reasons[0];if(!reason)return lateActivities>0?{kind:'schedule',label:'BEHIND PLAN',detail:`${lateActivities} ${lateActivities===1?'activity':'activities'} overdue`}:null;
  const alert=reason.startsWith('Quality hold · ')?{kind:'quality' as const,label:'QUALITY HOLD',detail:reason.slice('Quality hold · '.length)}
    :reason.startsWith('Waiting for material · ')?{kind:'parts' as const,label:'PARTS',detail:reason.slice('Waiting for material · '.length)}
    :reason.startsWith('Waiting for ')&&reason.includes(' crew · ')?{kind:'crew' as const,label:'CREW',detail:reason.slice('Waiting for '.length)}
    :reason.startsWith('Waiting for ')&&reason.includes(' equipment · ')?{kind:'equipment' as const,label:'EQUIPMENT',detail:reason.slice('Waiting for '.length)}
    :{kind:'flow' as const,label:'FLOW',detail:reason.replace(/^Waiting for /,'')};
  return lateActivities>0?{...alert,label:`${alert.label} · ${lateActivities} LATE`,detail:`${alert.detail}; ${lateActivities} scheduled ${lateActivities===1?'activity':'activities'} overdue`}:alert;
}
