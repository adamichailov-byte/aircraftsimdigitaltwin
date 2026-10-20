import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {FleetClient} from '../simulation/client';
import {bindSimulationClock,simulationSpeeds} from '../simulation/clock';
import {calendarStateAt} from '../simulation/calendar';
import {fleetFixture} from '../simulation/flow';
import {fleetPose} from '../simulation/selectors';
import {stationPoses} from '../simulation/transfers';
import {Materials} from './Materials';
import {aircraftAlert} from '../simulation/alerts';
import {lateAircraftActivities} from '../simulation/schedule';

const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function FleetControls({client,onReset,onLogistics,onHistory,historyOpen}:{client:FleetClient;onReset:()=>void;onLogistics:()=>void;onHistory:()=>void;historyOpen:boolean}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot);
  const clock=useSyncExternalStore(client.clock.subscribe,client.clock.getSnapshot);
  const schedule=useRef<HTMLDetailsElement>(null);
  useEffect(()=>bindSimulationClock(client.clock),[client]);
  const fleet=view.displayFleet,busy=view.state==='starting'||view.state==='computing',historical=view.history.cursor!==null;
  const stopped=!fleet||fleet.nextEventInstant===null;
  const state=fleet?calendarStateAt(client.config.recipe.calendar,fleet.instant):null;
  return <section className="simulation-clock" aria-label="Fleet simulation clock">
    <div className="calendar-reading"><span className="calendar-label">{client.config.name}</span>
      <time dateTime={new Date(fleet?.instant??client.config.recipe.start).toISOString()}>{date.format(fleet?.instant??client.config.recipe.start)}</time>
      <span className="calendar-status" role="status">{historical?`Viewing recorded state · live at ${date.format(view.fleet?.instant??client.config.recipe.start)}`:view.error|| (busy?(view.progressInstant?`Calculating · ${date.format(view.progressInstant)}`:'Calculating…'):view.state==='cancelled'?'Calculation cancelled':fleet?.diagnosis||(fleet?.status==='complete'?'All orders complete':`${state?.shift??'Off shift'} · ${state?.status??'Starting'}`))}</span>
    </div>
    <div className="calendar-controls">
      <button disabled={stopped||busy||historical} onClick={()=>client.play(!clock.playing)} aria-label={clock.playing?'Pause simulation':'Play simulation'}>{clock.playing?'Pause':'Play'}</button>
      <button disabled={stopped||busy||historical} onClick={()=>client.command('operation')}>Next operation</button>
      <button disabled={stopped||busy||historical} onClick={()=>client.command('run')}>Run to horizon</button>
      {busy&&<button onClick={()=>client.cancel()}>Cancel calculation</button>}
      <button onClick={()=>{onReset();client.reset();}}>Reset fleet</button>
      <button onClick={onLogistics}>Receiving</button>
      <button aria-expanded={historyOpen} onClick={onHistory}>History</button>
      {historical&&<button onClick={()=>client.returnToLive()}>Return to live</button>}
      <select aria-label="Simulation speed" value={clock.speed} onChange={e=>client.clock.setSpeed(Number(e.target.value))}>
        {simulationSpeeds.map((speed,i)=><option key={speed} value={speed}>{['1 sim min / sec','1 sim hour / sec','1 sim day / sec'][i]}</option>)}
      </select>
      <details className="calendar-details" ref={schedule}><summary>Run options</summary><div className="calendar-schedule">
        <strong>Fixed teaching fixtures</strong><p>90 days ·24 orders ·3 incoming spaces ·WIP limit12 ·2 tow tugs. Finite stock, named per-shift crews and shared equipment, one slot per bay/paint/acceptance and two delivery stands.</p>
        <button onClick={()=>{if(schedule.current)schedule.current.open=false;onReset();client.reset(fleetFixture('baseline'));}}>Baseline run</button>
        <button onClick={()=>{if(schedule.current)schedule.current.open=false;onReset();client.reset(fleetFixture('slow-bay-3'),'blocked-example');}}>Show queue example</button>
        <button onClick={()=>{if(schedule.current)schedule.current.open=false;onReset();client.reset(fleetFixture('late-engines'),'material-example');}}>Show engine shortage</button>
        <button onClick={()=>{if(schedule.current)schedule.current.open=false;onReset();client.reset(fleetFixture('limited-inspectors'),'resource-example');}}>Show inspector bottleneck</button>
        <button onClick={()=>{if(schedule.current)schedule.current.open=false;onReset();client.reset(fleetFixture('receiving-demo'),'logistics-example');onLogistics();}}>Follow delayed engine kit</button>
        <button onClick={()=>{if(schedule.current)schedule.current.open=false;onReset();client.reset(fleetFixture('wing-crane-outage'),'outage-example');}}>Show wing-crane outage</button>
        <button onClick={()=>{if(schedule.current)schedule.current.open=false;onReset();client.reset(fleetFixture('inspection-rework'),'rework-example');}}>Show inspection rework</button>
        <button disabled={stopped||busy||historical} onClick={()=>{if(schedule.current)schedule.current.open=false;client.command('event');}}>Next event</button>
        <p>Queue example starts empty, slows Bay03 work4×, then computes until both upstream bays are blocked. No hidden initial aircraft.</p>
        <p>Engine shortage starts empty with one usable engine and one quarantined. Accepted engine receipts wait until Jan25. Materials shows the exact lot and receipt time.</p>
        <p>Inspector bottleneck starts empty with simultaneous releases and only two quality crew per shift. A second ready inspection waits while the first holds both.</p>
        <p>Engine kit example pauses at dock arrival. Inspection is delayed until11:00; its seven engines stay unavailable through inspection, kitting, loading, travel and unloading. One forklift shares logistics crew and aircraft crossing locks.</p>
        <p>Wing-crane example advances to the scheduled maintenance window, pauses only active crane-dependent work, holds the aircraft in Bay02 and resumes preserved work after recovery.</p>
        <p>Inspection example uses a fixed seed, fails a structure check, then inserts repair and reinspection tasks at Bay02. Rework is capped at two cycles before a visible quality hold.</p>
        <p>America/New_York. Weekdays06–22 with breaks10–10:30 and18–18:30. Cure, flight and started tows use elapsed time. Handling pauses with its load.</p>
      </div></details>
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
function ResourceBoard({fleet,onFocus}:{fleet:NonNullable<ReturnType<FleetClient['getSnapshot']>['fleet']>;onFocus:(id:string)=>void}){
  const active=fleet.resources.allocations;
  const waiting=fleet.aircraft.flatMap(aircraft=>aircraft.pilot.tasks.filter(task=>task.state==='waiting-resource'||task.state==='paused-equipment')
    .map(task=>({aircraft,task})));
  const alerts=fleet.aircraft.flatMap(aircraft=>{const alert=aircraftAlert(aircraft.reasons);return alert?[{aircraft,alert}]:[];});
  return <section className="resource-board" aria-label="Crew and equipment allocations">
    <div className="resource-heading"><strong>{fleet.resources.shift??'Off shift'} availability</strong>
      <span>{active.length} active assignments · {waiting.length} waiting</span></div>
    {alerts.length>0&&<section className="resource-alert-overview" aria-label="Active aircraft warnings" role="status">
      <div className="resource-alert-heading"><span className="resource-alert-icon" aria-hidden="true">!</span>
        <strong>{alerts.length} active aircraft {alerts.length===1?'warning':'warnings'}</strong></div>
      {alerts.slice(0,1).map(({aircraft,alert})=><button key={aircraft.id} onClick={()=>onFocus(aircraft.id)}>
        {aircraft.id} · {alert.label} · {alert.detail} <span>View aircraft</span>
      </button>)}
      {alerts.length>1&&<details><summary>View all {alerts.length} aircraft warnings</summary><ul>{alerts.map(({aircraft,alert})=><li key={aircraft.id}>
        <button onClick={()=>onFocus(aircraft.id)}>{aircraft.id} · {alert.label} · {alert.detail}</button>
      </li>)}</ul></details>}
    </section>}
    <p>{fleet.resources.crews.filter(pool=>pool.capacity>0).map(pool=>`${pool.pool} ${pool.used}/${pool.capacity}`).join(' · ')||'No crew scheduled'}</p>
    <p className="resource-equipment">Equipment {fleet.resources.equipment.map(pool=>`${pool.pool.replaceAll('-',' ')} ${pool.used}/${pool.capacity}`).join(' · ')}</p>
    {fleet.resources.outages.length>0&&<div className="resource-outages" aria-label="Equipment outage status">{fleet.resources.outages.map(outage=><p
      key={outage.id} className={outage.state==='active'?'is-active':''}><strong>{outage.equipmentId.replaceAll('-',' ')}</strong>
      <span>{outage.state==='active'?'Unavailable · recovery':outage.state==='scheduled'?'Scheduled outage · recovery':'Recovered'} · {date.format(outage.end)}</span>
    </p>)}</div>}
    <details><summary>Active assignments · {active.length}</summary><ul>{active.map(item=><li key={`${item.serialId}/${item.taskId}`}>
      <span>{item.serialId} · {item.taskId.replaceAll('-',' ')}</span><small>{[resourceNames(item.crews),resourceNames(item.equipment)].filter(Boolean).join(' + ')||'No crew or equipment lease'}</small>
    </li>)}</ul></details>
    <details><summary>Waiting for a resource · {waiting.length}</summary><ul>{waiting.map(({aircraft,task})=><li key={`${aircraft.id}/${task.taskId}`}>
      <span>{aircraft.id} · {task.label}</span><small>{(task.resourceBlockers??[]).join(' · ')}</small>
    </li>)}</ul></details>
  </section>;
}
export function FleetInspector({client,selectedId,zoneId,onSelect,onClose,onFocus}:{client:FleetClient;selectedId:string|null;zoneId:string|null;
  onSelect:(id:string)=>void;onClose:()=>void;onFocus:(id:string)=>void}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot),{plan}=view,fleet=view.displayFleet,actual=view.displayActual;
  const [station,setStation]=useState('current');
  const aircraft=fleet?.aircraft.find(a=>a.id===selectedId)??(zoneId?fleet?.aircraft.find(a=>a.state!=='delivered'&&fleetPose(client.config,fleet,a).zoneId===zoneId):fleet?.aircraft.find(a=>a.state!=='delivered'));
  useEffect(()=>setStation('current'),[aircraft?.id]);
  const pose=fleet&&aircraft?fleetPose(client.config,fleet,aircraft):null;
  const lateActivities=aircraft&&fleet?lateAircraftActivities(plan,actual,fleet.instant,aircraft.id):[];
  const current=station==='current'?aircraft?.slot:station;
  const tasks=aircraft?.pilot.tasks.filter(task=>aircraft.tasks.find(t=>t.id===task.taskId)?.stationId===current)??[];
  return <aside className="inspector task-inspector" aria-label="Aircraft tasks">
    <header className="inspector-heading"><div><span className="eyebrow">FINITE CAPACITY · FLEET</span><h2>{aircraft?.id??'Plant flow'}</h2></div><button onClick={onClose} aria-label="Close aircraft tasks">Close</button></header>
    <label className="pilot-stage-select">Aircraft<select aria-label="Aircraft serial" value={aircraft?.id??''} onChange={e=>{setStation('current');onSelect(e.target.value);}}>
      {!aircraft&&<option value="">Select an aircraft</option>}{fleet?.aircraft.map(a=><option key={a.id} value={a.id}>{a.id} · {a.state}</option>)}
    </select></label>
    {fleet&&<ResourceBoard fleet={fleet} onFocus={onFocus}/>}
    {!aircraft&&<p className="pilot-summary">{fleet?.diagnosis||'No aircraft in this area. Orders remain upstream until an incoming space and WIP admission are available.'}</p>}
    {aircraft&&pose&&<>
      <p className="pilot-summary">{pose.label} · {pose.state==='off-shift'&&aircraft.pilot.tasks.some(task=>task.state==='waiting-day-window')?'awaiting next daily start window':pose.state}{pose.phase?` · ${pose.reverse?'reversing':pose.phase}`:''}</p>
      {lateActivities.length>0&&<section className="pilot-plan-alert" aria-label={`${aircraft.id} activities behind plan`} role="status">
        <strong><span aria-hidden="true">!</span> {lateActivities.length} {lateActivities.length===1?'activity':'activities'} behind plan</strong>
        <ul>{lateActivities.map(({row,status})=><li key={row.id}><span>{row.label} · {stationPoses[row.station]?.label??row.station}</span>
          <b>{status.state==='complete'?'Completed late':`Overdue ${hours(status.delay)}`}</b></li>)}</ul>
      </section>}
      {fleet?.transfers.filter(t=>t.serialId===aircraft.id).map(t=><p key={t.id} className="pilot-limit">Tow {t.tugId.replace('tug-','tug ')} · destination reserved · source {t.cleared?'tail clear':'held until tail-clear'}</p>)}
      {aircraft.reasons.length>0&&<div className="flow-blocker" role="status"><span className="flow-blocker-icon" aria-hidden="true">!</span>
        <div>{aircraft.reasons.map(reason=><p key={reason}>{reason}</p>)}</div></div>}
      {pose.state==='offsite'&&<p className="pilot-limit">Offsite flight · return stand retained.</p>}
      <button className="pilot-focus" disabled={!pose.visible} onClick={()=>onFocus(aircraft.id)}>Follow aircraft</button>
      {pose.state==='transferring'&&<button className="pilot-tow-step" disabled={view.history.cursor!==null} onClick={()=>client.stepTow(aircraft.id)}>Step tow manoeuvre</button>}
      <label className="pilot-stage-select">Recipe station<select aria-label="Recipe station" value={station} onChange={e=>setStation(e.target.value)}>
        <option value="current">Current location</option>{[...new Set(aircraft.tasks.map(t=>t.stationId!))].map(id=><option key={id} value={id}>{stationPoses[id]?.label??id}</option>)}
      </select></label>
      {tasks.some(task=>aircraft.tasks.find(t=>t.id===task.taskId)?.finishWithinDay)&&<p className="pilot-limit">Daily jobs · start when enough working time remains today. Breaks and shift handovers preserve progress.</p>}
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
      <details className="pilot-history"><summary>Recent activity for this serial</summary><ol>{aircraft.pilot.history.map(e=><li key={e.id}><time>{date.format(e.instant)}</time><span>{e.payload.label} · {e.kind}</span></li>)}</ol></details>
    </>}
    {!aircraft&&fleet&&<Materials fleet={fleet} config={client.config} readOnly={view.history.cursor!==null} onReceipt={at=>{client.play(false);client.advance(at);}}/>}
    <details className="pilot-assumptions"><summary>Flow assumptions</summary><p>FCFS by readiness time, then serial ID. Source stays occupied until tail-clear. Destination, tow tug, qualified crew and conflicting corridor locks must all be available before a move starts; whole-corridor locks are conservative. Delivery orders alternate between the two marked stands. Offsite flight holds its return stand.</p><p>Daily jobs normally contain 2–4 productive hours. A job waits before starting if today's remaining working time cannot cover it; breaks and staffed shift handovers may occur within the day. Unplanned outages can still interrupt started work. Cure and offsite flight follow elapsed time.</p><p>Materials, crews and shared equipment use finite synthetic stock and per-shift capacity. A task gets its full fixed crew and required equipment together or waits; adding available people increases concurrency without shortening task duration. Assigned equipment policy determines whether it stays held across a shift. Replenishment becomes usable only after inspection, kitting and unloading in central stores; onward bay distribution is abstracted.</p></details>
  </aside>;
}
