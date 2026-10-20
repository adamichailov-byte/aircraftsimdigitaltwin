import {useMemo,useSyncExternalStore} from 'react';
import type {FleetClient} from '../simulation/client';
import {classifyTaskTime,nearestHistoryCheckpoint} from '../simulation/history';
import type {FlowEvent} from '../simulation/flow';

const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function label(event:FlowEvent){return event.label||event.kind.replaceAll('-',' ');}

export function History({client,onClose,onSelectAircraft}:{client:FleetClient;onClose:()=>void;onSelectAircraft:(id:string)=>void}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot),ledger=view.history;
  const points=ledger.checkpoints,index=ledger.cursor===null?Math.max(0,points.length-1):Math.max(0,points.findIndex(point=>point.instant===ledger.cursor));
  const checkpoint=points[index],at=ledger.cursor??view.fleet?.instant??client.config.recipe.start;
  const visible=useMemo(()=>ledger.events.filter(event=>event.instant<=at).slice(-40),[ledger.events,ledger.events.length,at]);
  const byId=useMemo(()=>new Map(ledger.events.map(event=>[event.id,event])),[ledger.events,ledger.events.length]);
  const moveTo=(instant:number)=>{const point=nearestHistoryCheckpoint(ledger,instant);if(point)client.setHistoryCursor(point.instant);};
  return <aside className="inspector task-inspector history-inspector" aria-label="Simulation history">
    <header className="inspector-heading"><div><span className="eyebrow">RECORDED RUN · CAUSAL EVENT LOG</span><h2>History</h2></div><button onClick={onClose} aria-label="Close history">Close</button></header>
    {points.length===0?<p className="pilot-summary">No simulation states have been recorded yet. Start or advance the run to create history.</p>:<>
      <div className="history-mode" role="status"><span>{ledger.cursor===null?'Live edge':'Viewing history'}</span>
        <time>{date.format(at)}</time>{ledger.cursor!==null&&<button onClick={()=>client.returnToLive()}>Return to live</button>}</div>
      <label className="history-range">Recorded state <input aria-label="Recorded simulation time" type="range" min={0} max={Math.max(0,points.length-1)} value={index}
        onChange={event=>client.setHistoryCursor(points[Number(event.target.value)].instant)}/><small>{index+1} of {points.length} retained checkpoints</small></label>
      {ledger.cursor===null&&view.fleet&&<p className="history-limit">Live simulation is at {date.format(view.fleet.instant)}. The list contains recorded events only; future plan rows are not shown as history.</p>}
      {checkpoint&&view.displayFleet&&<section className="history-state" aria-label="State at selected time">
        <strong>{view.displayFleet.delivered} aircraft departed · {view.displayFleet.wip} in plant · {view.displayFleet.upstream} upstream</strong>
        {view.displayFleet.aircraft.flatMap(aircraft=>aircraft.pilot.tasks.filter(task=>task.state==='waiting-material'||task.state==='waiting-resource'||task.state==='paused-equipment'
          ||task.state==='paused-off-shift'||task.state==='waiting-day-window'||task.state==='quality-hold'||(aircraft.state==='blocked'&&task.state==='pending')).map(task=>({aircraft,task,classification:classifyTaskTime(task,aircraft.reasons)})))
          .slice(0,8).map(({aircraft,task,classification})=><div className="history-wait" key={`${aircraft.id}/${task.taskId}`}>
            <button onClick={()=>{onClose();onSelectAircraft(aircraft.id);}}><b>{aircraft.id}</b> · {task.label} · <strong>{classification.primary}</strong> · Inspect</button>
            {classification.blockers.length>0&&<small>Concurrent blockers: {classification.blockers.join(' · ')}</small>}
          </div>)}
      </section>}
      <ol className="history-events" aria-label="Recorded events">
        {visible.map(event=><li key={event.id} className={event.kind.includes('blocked')||event.kind.includes('failed')||event.kind.includes('paused')?'is-warning':''}>
          <button className="history-event" onClick={()=>{moveTo(event.instant);onClose();if(event.serialId)onSelectAircraft(event.serialId);}}>
            <time>{date.format(event.instant)}</time><strong>{event.serialId||event.entityIds.join(', ')||'Plant'}</strong><span>{label(event)}</span>
          </button>
          {event.causeEventIds.length>0&&<details><summary>{event.causeEventIds.length} linked {event.causeEventIds.length===1?'cause':'causes'}</summary>
            <ul>{event.causeEventIds.map((id,ordinal)=>{const cause=byId.get(id);return <li key={`${id}/${ordinal}`}><button onClick={()=>moveTo(cause?.instant??event.instant)}>
              {cause?`${date.format(cause.instant)} · ${cause.serialId||'Plant'} · ${label(cause)}`:`Recorded cause ${id}`}</button></li>;})}</ul>
          </details>}
        </li>)}
      </ol>
      {visible.length===0&&<p className="pilot-summary">No events have been recorded by this time.</p>}
      <p className="history-limit">History is read-only. Scrubbing selects retained states and never reruns work, issues parts or changes the run outcome.</p>
    </>}
  </aside>;
}
