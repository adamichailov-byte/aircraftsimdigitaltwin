import {useMemo,useState,useSyncExternalStore} from 'react';
import type {FleetClient} from '../simulation/client';
import {scheduleState} from '../simulation/schedule';
import {defaultStationBufferMs} from '../simulation/station-buffer';

const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const stamp=(at:number|null|undefined)=>at==null?'—':date.format(at);
function delay(ms:number){return ms<3600000?`${Math.ceil(ms/60000)}m`:`${(ms/3600000).toFixed(1)}h`;}

export function MasterSchedule({client,onAircraft,onReceipt,onOpen,open,setOpen}:{client:FleetClient;onAircraft:(id:string)=>void;onReceipt:(id:string)=>void;onOpen:()=>void;open:boolean;setOpen:(open:boolean)=>void}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot),fleet=view.displayFleet,plan=view.plan,actual=view.displayActual;
  const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[limit,setLimit]=useState(60);
  const rows=useMemo(()=>{
    if(!plan)return[];
    const known=new Set(plan.activities.map(row=>row.id));
    const rework=fleet?.aircraft.flatMap(aircraft=>aircraft.tasks.filter(task=>task.id.includes('/repair-')||task.id.includes('/recheck-')
      ?!known.has(`aircraft/${aircraft.id}/${task.id}`):false).map(task=>({id:`aircraft/${aircraft.id}/${task.id}`,owner:aircraft.id,
        kind:'aircraft' as const,label:task.label,station:task.stationId??'Plant',resources:[...Object.entries(task.crewRequirements).map(([name,n])=>`${name} crew ×${n}`),
          ...Object.entries(task.equipmentRequirements??{}).map(([name,n])=>`${name} ×${n}`)],start:null,finish:null})))??[];
    return [...plan.activities,...rework].map(row=>({row,actual:actual[row.id],status:scheduleState(row,actual[row.id],fleet?.instant??client.config.recipe.start)}));
  },[plan,actual,fleet,client]);
  const overdue=rows.filter(item=>item.status.state==='overdue');
  const owners=new Set(overdue.map(item=>item.row.owner));
  const shown=rows.filter(({row,actual:time,status})=>(filter==='all'||filter==='overdue'&&status.state==='overdue'||filter==='active'&&time?.start!=null&&time.finish==null
    ||filter==='aircraft'&&row.kind==='aircraft'||filter==='receiving'&&row.kind==='receiving'||filter==='equipment'&&row.resources.some(r=>!r.includes('crew')))
    &&`${row.owner} ${row.label} ${row.station} ${row.resources.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const inspect=(kind:string,id:string)=>{setOpen(false);if(kind==='aircraft')onAircraft(id);else if(kind==='receiving')onReceipt(id);};
  return <section className={`master-schedule${open?' is-open':''}`} aria-label="Master schedule">
    <div className="schedule-rail">
      <button aria-expanded={open} onClick={()=>{if(!open)onOpen();setOpen(!open);}}>Master schedule <span>{open?'−':'+'}</span></button>
      <span className="schedule-rail-note">{plan?`${rows.filter(r=>r.actual?.start!=null&&r.actual.finish==null).length} started / unfinished · ${rows.filter(r=>r.status.state==='complete').length} complete`:
        view.planState==='building'?'Building capacity plan…':'Plan unavailable · reset fleet to rebuild'}</span>
      {overdue.length>0?<button className="schedule-alert" aria-label="Review overdue activities" onClick={()=>{onOpen();setFilter('overdue');setSearch('');setLimit(60);setOpen(true);}}>
        <b aria-hidden="true">!</b> <span role="status">{overdue.length} {overdue.length===1?'activity':'activities'} behind plan · {owners.size} affected {owners.size===1?'asset / job':'assets / jobs'}</span> <span>Review</span>
      </button>:plan&&<span className="schedule-on-time" role="status">No overdue activities</span>}
    </div>
    {open&&<div className="schedule-drawer">
      <header><div><span className="eyebrow">PLANNED / ACTUAL · NEW YORK TIME</span><h2>Plant master schedule</h2></div><button onClick={()=>setOpen(false)} aria-label="Close master schedule">Close</button></header>
      <p className="schedule-basis">{view.history.cursor!==null?`Recorded state · ${stamp(view.history.cursor)}. `:''}{plan?.label??(view.planState==='failed'?'Plan calculation failed · reset fleet to retry':'Building capacity plan in the background')}. Dispatch follows shared parts, crew, equipment, space and route constraints. {client.config.stationBuffersMs?'The plan includes the station buffers from Simulation settings before each departure.':`The plan includes ${(client.config.stationBufferMs??defaultStationBufferMs)/60000} staffed minutes of handoff buffer per station before departure;`} breaks and closed shifts do not consume it. Dates stay fixed until reset.</p>
      {plan?.diagnosis&&<p className="schedule-plan-limit">Plan limit: {plan.diagnosis}. A dash means no feasible time was scheduled within the horizon.</p>}
      <div className="schedule-filters"><label>Show<select aria-label="Schedule filter" value={filter} onChange={e=>{setFilter(e.target.value);setLimit(60);}}>
        <option value="all">All activities</option><option value="active">Started / unfinished</option><option value="overdue">Behind plan</option>
        <option value="aircraft">Aircraft work & tows</option><option value="receiving">Receiving jobs</option><option value="equipment">Equipment assignments</option>
      </select></label><label>Find<input aria-label="Search schedule" placeholder="Aircraft, forklift, crane, crew…" value={search} onChange={e=>{setSearch(e.target.value);setLimit(60);}}/></label><span>{shown.length} activities</span></div>
      <div className="schedule-table-scroll" tabIndex={0} aria-label="Scheduled activities"><table><thead><tr><th>Aircraft / job · activity</th><th>Station / resources</th><th>Planned start → finish</th><th>Actual start → finish</th><th>Status</th></tr></thead>
        <tbody>{shown.slice(0,limit).map(({row,actual:time,status})=>{
          const aircraft=fleet?.aircraft.find(a=>a.id===row.owner),job=fleet?.logistics.jobs.find(j=>j.id===row.owner);
          const blockers=row.kind==='aircraft'?aircraft?.reasons:row.kind==='receiving'?job?.blockers:undefined;
          return <tr key={row.id} className={status.late?'schedule-late':''}>
            <td>{row.kind==='equipment'?<span className="schedule-owner">{row.owner.replaceAll('-',' ')}</span>
              :<button disabled={row.kind==='aircraft'&&!aircraft} onClick={()=>inspect(row.kind,row.owner)}>{row.owner}</button>}<span>{row.label}</span></td>
            <td><span>{row.station}</span><small>{row.resources.join(' · ')||'No crew / tool required'}</small></td>
            <td>{stamp(row.start)}<span>→ {stamp(row.finish)}</span></td><td>{stamp(time?.start)}<span>→ {stamp(time?.finish)}</span></td>
            <td><strong>{status.state==='overdue'?`Overdue ${delay(status.delay)}`:status.state==='complete'?(status.late?`Completed ${delay(status.delay)} late`:'Complete'):status.state==='active'?'In progress':row.id.includes('/repair-')||row.id.includes('/recheck-')?'Added rework':row.start==null?'Unscheduled':'Planned'}</strong>
              {status.state==='overdue'&&<small>{blockers?.length?`Current ${row.kind==='aircraft'?'aircraft':'job'}: ${blockers.join(' · ')}`:time?.start!=null?
                row.finish!=null&&(fleet?.instant??0)>row.finish?'Started; planned finish has passed.':'Started after planned start.':row.kind==='equipment'?'Scheduled outage has not started at its planned time.':'Waiting on preceding work or dispatch; inspect the asset for detail.'}</small>}</td>
          </tr>;
        })}</tbody></table>
        {shown.length===0&&<p className="schedule-empty">No activities match this view.</p>}
        {shown.length>limit&&<button className="schedule-more" onClick={()=>setLimit(limit+60)}>Show 60 more · {shown.length-limit} remaining</button>}
      </div>
      <p className="schedule-footnote">Forecast rows are plans, not completed work. Red marks missed starts / finishes; late completions stay marked. Rows list required crews and tools; equipment can remain reserved across pauses. Crew are pooled, tools are finite, and this is not an optimizer. Synthetic durations.</p>
    </div>}
  </section>;
}
