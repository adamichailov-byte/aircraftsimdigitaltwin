import {useEffect,useState,useSyncExternalStore} from 'react';
import type {FleetClient} from '../simulation/client';
import {bindSimulationClock,simulationSpeeds} from '../simulation/clock';
import {calendarStateAt} from '../simulation/calendar';
import {fleetPose} from '../simulation/selectors';
import {stationPoses} from '../simulation/transfers';
import {Materials} from './Materials';
import {aircraftStatusAlert} from '../simulation/alerts';
import {lateAircraftActivities} from '../simulation/schedule';

const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function FleetControls({client}:{client:FleetClient}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot);
  const clock=useSyncExternalStore(client.clock.subscribe,client.clock.getSnapshot);
  useEffect(()=>bindSimulationClock(client.clock),[client]);
  const fleet=view.displayFleet,busy=view.state==='starting'||view.state==='computing',historical=view.history.cursor!==null;
  const stopped=!fleet||fleet.nextEventInstant===null;
  const state=fleet?calendarStateAt(client.config.recipe.calendar,fleet.instant):null;
  return <section className={`simulation-clock${historical?' is-historical':''}`} aria-label="Fleet simulation clock">
    <div className="calendar-reading"><span className="calendar-label">{client.config.name}</span>
      <time dateTime={new Date(fleet?.instant??client.config.recipe.start).toISOString()}>{date.format(fleet?.instant??client.config.recipe.start)}</time>
      <span className="calendar-status" role="status">{historical?`Viewing recorded state · live at ${date.format(view.fleet?.instant??client.config.recipe.start)}`:view.error|| (busy?(view.progressInstant?`Advancing · ${date.format(view.progressInstant)}`:'Starting simulation…'):view.state==='cancelled'?'Simulation paused':fleet?.diagnosis||(fleet?.status==='complete'?'All orders complete':`${state?.shift??'Off shift'} · ${state?.status??'Starting'}`))}</span>
    </div>
    <div className="calendar-controls">
      <button disabled={stopped||busy||historical} onClick={()=>client.play(!clock.playing)} aria-label={clock.playing?'Pause simulation':'Play simulation'}>{clock.playing?'Pause':'Play'}</button>
      <button disabled={stopped||busy||historical} onClick={()=>client.command('operation')}>Next operation</button>
      {busy&&<button onClick={()=>client.cancel()}>Cancel calculation</button>}
      {historical&&<button onClick={()=>client.returnToLive()}>Return to live</button>}
      <select aria-label="Simulation speed" title="Simulated time per real second" value={clock.speed} onChange={e=>client.clock.setSpeed(Number(e.target.value))}>
        {simulationSpeeds.map((speed,i)=><option key={speed} value={speed}>{['1 min / sec','1 hour / sec','1 day / sec'][i]}</option>)}
      </select>
      <button type="button" onClick={()=>window.location.reload()} title="Reload the site and restore the default baseline. Clears settings, progress and history.">Hard reset</button>
    </div>
    <p className="calendar-next">{fleet?`${fleet.admitted} admitted · ${fleet.wip} in plant · ${fleet.upstream} waiting upstream · ${fleet.delivered} departed`:'Starting the simulation'}
      <span> · Synthetic assumptions v1 · view time shown</span></p>
    {new URLSearchParams(location.search).has('profile')&&<output data-testid="fleet-diagnostics">{fleet?JSON.stringify({runId:fleet.runId,status:fleet.status,instant:fleet.instant,eventCount:fleet.eventCount,digest:fleet.digest}):'starting'}</output>}
  </section>;
}

function hours(ms:number){return `${(ms/3600000).toFixed(1)}h`;}
function resourceNames(units:readonly {pool:string;unit:number}[]){
  return units.map(unit=>`${unit.pool.replaceAll('-',' ')} ${unit.unit}`).join(', ');
}
export function FleetInspector({client,selectedId,zoneId,onSelect,onClose,onFocus}:{client:FleetClient;selectedId:string|null;zoneId:string|null;
  onSelect:(id:string)=>void;onClose:()=>void;onFocus:(id:string)=>void}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot),{plan}=view,fleet=view.displayFleet,actual=view.displayActual;
  const [station,setStation]=useState('current');
  const aircraft=fleet?.aircraft.find(a=>a.id===selectedId)??(zoneId?fleet?.aircraft.find(a=>a.state!=='delivered'&&fleetPose(client.config,fleet,a).zoneId===zoneId):fleet?.aircraft.find(a=>a.state!=='delivered'));
  useEffect(()=>setStation('current'),[aircraft?.id]);
  const pose=fleet&&aircraft?fleetPose(client.config,fleet,aircraft):null;
  const lateActivities=aircraft&&fleet?lateAircraftActivities(plan,actual,fleet.instant,aircraft.id):[];
  const currentAlert=aircraft&&fleet?aircraftStatusAlert(aircraft,plan,actual,fleet.instant):null;
  const current=station==='current'?aircraft?.slot:station;
  const tasks=aircraft?.pilot.tasks.filter(task=>aircraft.tasks.find(t=>t.id===task.taskId)?.stationId===current)??[];
  return <aside className="inspector task-inspector" aria-label="Aircraft tasks">
    <header className="inspector-heading"><div><span className="eyebrow">Aircraft overview</span><h2>{aircraft?.id??'Plant flow'}</h2></div><button onClick={onClose} aria-label="Close aircraft tasks">Close</button></header>
    <label className="pilot-stage-select">Aircraft<select aria-label="Aircraft serial" value={aircraft?.id??''} onChange={e=>{setStation('current');onSelect(e.target.value);}}>
      {!aircraft&&<option value="">Select an aircraft</option>}{fleet?.aircraft.map(a=><option key={a.id} value={a.id}>{a.id} · {a.state}</option>)}
    </select></label>
    {!aircraft&&<p className="pilot-summary">{fleet?.diagnosis||'No aircraft in this area. Orders remain upstream until an incoming space and WIP admission are available.'}</p>}
    {aircraft&&pose&&<>
      <p className="pilot-summary">{pose.label} · {pose.state==='off-shift'&&aircraft.pilot.tasks.some(task=>task.state==='waiting-day-window')?'awaiting next daily start window':pose.state==='buffering'?'planned station buffer':pose.state}{pose.phase?` · ${pose.reverse?'reversing':pose.phase}`:''}</p>
      {aircraft.state==='buffering'&&aircraft.stationBufferUntil!=null&&<p className="pilot-limit">Station work complete. Planned buffer holds this space until {date.format(aircraft.stationBufferUntil)}; crews are available for other work.</p>}
      <dl className="aircraft-milestones">
        <div><dt>Recipe completed</dt><dd>{aircraft.pilot.tasks.filter(task=>task.state==='complete').length}<small> / {aircraft.pilot.tasks.length} tasks</small></dd></div>
        <div><dt>Station work left</dt><dd>{hours(tasks.reduce((total,task)=>total+task.remainingWorkMs,0))}<small> task hours</small></dd></div>
      </dl>
      {lateActivities.length>0&&<section className="pilot-plan-alert" aria-label={`${aircraft.id} activities behind plan`} role="status">
        <strong><span aria-hidden="true">!</span> {lateActivities.length} {lateActivities.length===1?'activity':'activities'} behind plan</strong>
        <ul>{lateActivities.map(({row,status})=><li key={row.id}><span>{row.label} · {stationPoses[row.station]?.label??row.station}</span>
          <b>{status.state==='complete'?'Completed late':`Overdue ${hours(status.delay)}`}</b></li>)}</ul>
      </section>}
      {fleet?.transfers.filter(t=>t.serialId===aircraft.id).map(t=><p key={t.id} className="pilot-limit">Tow {t.tugId.replace('tug-','tug ')} · destination reserved · source {t.cleared?'tail clear':'held until tail-clear'}</p>)}
      {aircraft.reasons.length>0&&<div className={currentAlert?"flow-blocker":"flow-wait"} role="status">{currentAlert&&<span className="flow-blocker-icon" aria-hidden="true">!</span>}
        <div>{aircraft.reasons.map(reason=><p key={reason}>{reason}</p>)}</div></div>}
      {pose.state==='offsite'&&<p className="pilot-limit">Offsite flight · return stand retained.</p>}
      <button className="pilot-focus" disabled={!pose.visible} onClick={()=>onFocus(aircraft.id)}>Follow aircraft</button>
      {pose.state==='transferring'&&<button className="pilot-tow-step" disabled={view.history.cursor!==null} onClick={()=>client.stepTow(aircraft.id)}>Step tow manoeuvre</button>}
      <label className="pilot-stage-select station-browser">Recipe station<select aria-label="Recipe station" value={station} onChange={e=>setStation(e.target.value)}>
        <option value="current">Current location</option>{[...new Set(aircraft.tasks.map(t=>t.stationId!))].map(id=><option key={id} value={id}>{stationPoses[id]?.label??id}</option>)}
      </select></label>
      {tasks.some(task=>aircraft.tasks.find(t=>t.id===task.taskId)?.finishWithinDay)&&<p className="pilot-limit">Daily jobs · start when enough working time remains today. Breaks and shift handovers preserve progress.</p>}
      <h3 className="task-section-title">Station tasks <span>{tasks.filter(task=>task.state==='complete').length}/{tasks.length} complete</span></h3>
      <ol className="pilot-tasks">{tasks.map(task=>{const recipe=aircraft.tasks.find(t=>t.id===task.taskId)!;
        const allocation=fleet?.resources.allocations.find(item=>item.serialId===aircraft.id&&item.taskId===task.taskId);
        const blocked=task.state==='waiting-material'||task.state==='waiting-resource'||task.state==='paused-equipment'||task.state==='quality-hold'||task.qualityStatus==='failed';
        const status=task.state==='quality-hold'?'Quality hold':task.state==='paused-equipment'?'Paused · equipment outage'
          :task.qualityStatus==='failed'?'Inspection failed · rework':task.qualityStatus==='repair'?'Repair'
          :task.qualityStatus==='reinspection'?'Reinspection':task.qualityStatus==='passed'?'Inspection passed'
          :task.state==='waiting-material'?'Waiting · parts':task.state==='waiting-resource'?'Waiting · crew or equipment'
          :task.state==='waiting-day-window'?'Next workday'
          :task.state==='pending'&&task.waitingFor.length===0&&aircraft.state==='blocked'?'Blocked':task.state==='running'?'Working'
          :task.state==='complete'?'Complete':task.state==='paused-off-shift'?'Paused · off shift':'Waiting';
        const late=lateActivities.find(item=>item.row.id.endsWith(`/${task.taskId}`));
        return <li key={task.taskId} className={late?'is-late':''}>
        <div className="pilot-task-title"><span>{task.label}</span><strong className={[blocked?'is-blocked':'',late?'is-late':''].filter(Boolean).join(' ')}>{(blocked||late)&&<span aria-hidden="true">! </span>}
          {late?`${status} · ${late.status.state==='complete'?'completed late':`behind plan ${hours(late.status.delay)}`}`:status}</strong></div>
        <progress aria-label={`${task.label} progress`} max={recipe.durationMs} value={recipe.durationMs-task.remainingWorkMs}/>
        <p>{hours(task.remainingWorkMs)} remaining <span>· {recipe.durationMode==='elapsed'?'elapsed':recipe.finishWithinDay?'daily job':'working'}</span></p>
        {task.waitingFor.length>0&&<small>Requires {task.waitingFor.map(id=>aircraft.tasks.find(t=>t.id===id)!.label).join(', ')}.</small>}
        {task.resourceBlockers?.map(reason=><small className="resource-blocker" key={reason}>{reason}</small>)}
        {task.calendarBlockers?.map(reason=><small key={reason}>{reason}</small>)}
        {allocation&&<small className="resource-assignment">Assigned: {[resourceNames(allocation.crews),resourceNames(allocation.equipment)].filter(Boolean).join(' + ')||'no people or equipment required'}</small>}
      </li>;})}</ol>
      <Materials fleet={fleet!} aircraft={aircraft} config={client.config} station={current} readOnly={view.history.cursor!==null} onReceipt={at=>{client.play(false);client.advance(at);}}/>
    </>}
    {!aircraft&&fleet&&<Materials fleet={fleet} config={client.config} readOnly={view.history.cursor!==null} onReceipt={at=>{client.play(false);client.advance(at);}}/>}
  </aside>;
}
