import { useMemo, useState, useSyncExternalStore } from 'react';
import type { PilotSession } from '../simulation/engine';
import { calendarStateAt } from '../simulation/calendar';
import { simulationPose } from '../scene/simulation-pose';
import { stationPoses } from '../simulation/transfers';

function workTime(ms:number) { const minutes=Math.ceil(ms/60000);return `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}m`; }
export function TaskInspector({session,onClose,onFocus}:{session:PilotSession;onClose:()=>void;onFocus:()=>void}) {
  const snapshot=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
  const definition=session.engine.definition,pose=simulationPose(definition,snapshot);
  const [view,setView]=useState('current');
  const format=useMemo(()=>new Intl.DateTimeFormat('en-US',{timeZone:definition.calendar.timeZone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),[definition.calendar.timeZone]);
  const byId=new Map(definition.tasks.map(task=>[task.id,task]));
  const station=view==='current'?(pose.state==='delivered'?'delivery':pose.returnSlot??pose.stationId):view;
  const tasks=snapshot.tasks.filter(task=>byId.get(task.taskId)!.stationId===station);
  const period=calendarStateAt(definition.calendar,snapshot.instant);
  return <aside className="inspector task-inspector" aria-label="Pilot aircraft tasks">
    <header className="inspector-heading"><div><span className="eyebrow">ONE AIRCRAFT · FULL RECIPE</span><h2>{snapshot.aircraft.id}</h2></div>
      <button onClick={onClose} aria-label="Close pilot tasks">Close</button></header>
    <p className="pilot-summary" aria-live="polite">{pose.label}{pose.state==='in-transfer'?` · ${pose.reverse?'reversing':pose.phase}`:''}</p>
    {pose.returnSlot && <p className="pilot-limit">Aircraft off site · flight-line return stand retained. No flight physics.</p>}
    {pose.state==='delivered' && <p className="pilot-limit">Aircraft departed. Serial and completed history retained.</p>}
    <button className="pilot-focus" onClick={onFocus} disabled={!pose.visible}>Follow aircraft</button>
    {pose.state==='in-transfer' && <button className="pilot-tow-step" onClick={()=>session.nextTowPhase()}>Step tow manoeuvre</button>}
    <label className="pilot-stage-select">Recipe station
      <select aria-label="Recipe station" value={view} onChange={event=>setView(event.target.value)}>
        <option value="current">Current location</option>
        {Object.entries(stationPoses).filter(([id])=>id!=='departed').map(([id,station])=><option key={id} value={id}>{station.label}</option>)}
      </select></label>
    <p className="eyebrow">{stationPoses[station]?.label ?? 'Delivery'} · {snapshot.tasks.filter(task=>task.state==='complete').length}/{snapshot.tasks.length} operations complete</p>
    <ol className="pilot-tasks">{tasks.map(task=>{
      const recipe=byId.get(task.taskId)!,elapsed=recipe.durationMode==='elapsed';
      const status=task.state==='complete'?'Complete':task.state==='running'?(recipe.kind==='transfer'?'Towing':elapsed?'Elapsed time':'Working')
        :task.state==='waiting-day-window'?'Next workday':task.state==='paused-off-shift'?(period.status==='break'?'Paused · break':'Paused · off shift'):'Waiting';
      return <li key={task.taskId}><div className="pilot-task-title"><span>{task.label}</span><strong>{status}</strong></div>
        <progress aria-label={`${task.label} progress`} max={recipe.durationMs} value={recipe.durationMs-task.remainingWorkMs}/>
        <p>{workTime(task.remainingWorkMs)} remaining <span>/ {workTime(recipe.durationMs)} {elapsed?'elapsed':recipe.finishWithinDay?'daily job':'working'}</span></p>
        {task.calendarBlockers?.map(reason=><small key={reason}>{reason}</small>)}
        {task.waitingFor.length>0&&<small>Requires {task.waitingFor.map(id=>byId.get(id)!.label).join(', ')}.</small>}
        {task.state==='pending'&&task.waitingFor.length===0&&<small>Waiting for a staffed working period.</small>}
        {task.state==='paused-off-shift'&&<small>Work preserved until the next working period.</small>}
        {task.completedAt!==null&&<small>Finished {format.format(task.completedAt)}</small>}
      </li>;
    })}</ol>
    <details className="pilot-assumptions"><summary>Availability and tow assumptions</summary>
      <p>Synthetic single-aircraft recipe v1. One serial; all destinations free. Fleet mode applies shared crew and equipment pools.</p>
      <p>Tow: 2m/s forward, 1m/s reverse, 1°/s manoeuvring pivot; 5 minutes each to connect/disconnect. Starts in a staffed period, then continues through breaks. Cure and flight use elapsed time.</p>
      {tasks.map(task=>{const recipe=byId.get(task.taskId)!;return <p key={task.taskId}><strong>{task.label}</strong>: {Object.entries({...recipe.crewRequirements,...recipe.equipmentRequirements,...recipe.materialRequirements}).map(([key,value])=>`${key} × ${value}`).join(', ')||'No crew or material'}</p>;})}
    </details>
    <details className="pilot-history"><summary>Recent activity · {snapshot.history.length} {snapshot.history.length===1?'event':'events'}</summary><ol>{snapshot.history.slice(-16).map(event=><li key={event.id}>
      <time dateTime={new Date(event.instant).toISOString()}>{format.format(event.instant)}</time><span>{event.payload.label} · {event.kind.replace('task-','').replaceAll('-',' ')}</span>
    </li>)}</ol></details>
    <p className="pilot-limit">One aircraft · no queues or production totals yet. Surrounding equipment is scenery.</p>
  </aside>;
}
