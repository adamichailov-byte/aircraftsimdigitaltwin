import {useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {FleetClient} from '../simulation/client';
import {compareRuns,compatibilityProblem,completionProblem,modelVersion,assumptionVersion} from '../simulation/compare';
import type {RecordedRun} from '../simulation/compare';
import {costCategories} from '../simulation/costs';
import {eventsCsv,exportScenario,importScenario,maxScenarioBytes,resultsCsv} from '../simulation/scenario-io';
import {buildFlowTimeline,FLOW_STATIONS} from './flow-timeline-data';

const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n/100);
const delta=(n:number)=>`${n>0?'+':''}${n}`;
function download(name:string,text:string,type:string){
  const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function AircraftTrace({run,serial,label}:{run:RecordedRun;serial:string;label:string}){
  const segments=useMemo(()=>buildFlowTimeline({fleet:{...run.fleet,aircraft:run.fleet.aircraft.filter(a=>a.id===serial)},events:run.events.filter(e=>e.serialId===serial),at:run.fleet.instant,historical:true,from:run.config.recipe.start,to:run.config.recipe.end}).segments,[run,serial]);
  const x=(t:number)=>105+(t-run.config.recipe.start)/(run.config.recipe.end-run.config.recipe.start)*670;
  const y=(id:string)=>14+(FLOW_STATIONS.length-1-Math.max(0,FLOW_STATIONS.findIndex(s=>s.id===id)))*13;
  const stamp=(n:number)=>new Intl.DateTimeFormat('en-US',{timeZone:run.config.recipe.calendar.timeZone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(n);
  return <figure className="comparison-trace"><figcaption>{label} · {serial} · {run.config.scenario?.fingerprint}</figcaption>
    <svg viewBox="0 0 800 202" role="img" aria-label={`${label} station timeline for ${serial}`}>
      {FLOW_STATIONS.map(s=><g key={s.id}><line x1="105" x2="775" y1={y(s.id)} y2={y(s.id)} stroke="currentColor" opacity=".12"/><text x="0" y={y(s.id)+3} fontSize="9" fill="currentColor">{s.label}</text></g>)}
      {segments.map(s=><line key={s.id} x1={x(s.start)} x2={Math.max(x(s.start)+1,x(s.end))} y1={y(s.station)} y2={y(s.to??s.station)} stroke={s.kind==='blocked'?'#c84f47':s.kind==='offshift'?'#858b89':'#58a5a0'} strokeWidth={s.kind==='delivery'?6:2} strokeDasharray={s.kind==='blocked'?'4 2':s.kind==='offshift'?'1 3':undefined}><title>{s.label} · {stamp(s.start)} → {stamp(s.end)} · {s.reason}</title></line>)}
      <text x="105" y="198" fontSize="9" fill="currentColor">{stamp(run.config.recipe.start)}</text><text x="775" y="198" textAnchor="end" fontSize="9" fill="currentColor">{stamp(run.config.recipe.end)}</text>
    </svg></figure>;
}
export function Comparison({client,onAircraft}:{client:FleetClient;onAircraft:(id:string)=>void}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot),baseline=client.baseline;
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[serial,setSerial]=useState('A100-001');
  const file=useRef<HTMLInputElement>(null);
  const unfinished=completionProblem(client.config,view.fleet,view.history.events);
  const current=useMemo<RecordedRun|null>(()=>!unfinished&&view.fleet&&view.state==='idle'?{modelVersion,assumptionVersion,config:client.config,fleet:view.fleet,events:view.history.events}:null,[view,client,unfinished]);
  const problem=baseline&&current?compatibilityProblem(baseline,current):'';
  const comparison=useMemo(()=>baseline&&current&&!problem?compareRuns(baseline,current):null,[baseline,current,problem]);
  const act=(action:()=>void)=>{try{action();setError('');}catch(reason){setError(reason instanceof Error?reason.message:'Unable to complete that action.');}};
  const save=(run:RecordedRun,baselineFile=false)=>download(`${baselineFile?'baseline':'scenario'}-${run.config.scenario?.fingerprint}.json`,exportScenario(run.config),'application/json');
  return <div className="comparison">
    <div className="comparison-actions"><button disabled={!current} onClick={()=>act(()=>{client.freezeBaseline();setMessage('Baseline frozen for this browser session. Save its scenario to reproduce it later.');})}>{baseline?'Replace baseline':'Freeze current run as baseline'}</button>
      {baseline&&<><button onClick={()=>act(()=>save(baseline,true))}>Save baseline JSON</button><button onClick={()=>{client.clearBaseline();setMessage('Baseline cleared.');}}>Clear baseline</button></>}
      <button onClick={()=>act(()=>download(`scenario-${client.config.scenario?.fingerprint}.json`,exportScenario(client.config),'application/json'))}>Save scenario JSON</button>
      <button onClick={()=>file.current?.click()}>Import & run scenario</button>
      <input ref={file} type="file" accept=".json,application/json" aria-label="Import scenario JSON" className="comparison-file" onChange={async e=>{const selected=e.currentTarget.files?.[0];e.currentTarget.value='';if(!selected)return;try{
        if(selected.size>maxScenarioBytes)throw new RangeError('Scenario exceeds the 1 MB limit.');
        const config=importScenario(await selected.text());client.reset(config);client.command('run');setError('');setMessage(`Imported configuration ${config.scenario?.fingerprint}.`);
      }catch(reason){setError(reason instanceof Error?reason.message:'Invalid scenario file.');}}}/>
    </div>
    {error&&<p role="alert" className="comparison-error">{error}</p>}{message&&<p role="status" className="results-note">{message}</p>}
    {!current&&<p className="results-note">{unfinished||'Calculation is still running.'} <button onClick={()=>client.command('run')}>Run to horizon</button></p>}
    {baseline?<p className="results-note">Baseline {baseline.config.scenario?.fingerprint} · seed {baseline.config.scenario?.seed} · {baseline.fleet.delivered} delivered / {baseline.fleet.wip} WIP. Frozen inputs and events stay unchanged when a new scenario runs.</p>:<p className="results-note">Finish a run and freeze it, then change inputs in Simulation settings or import a saved scenario. Baselines stay in this session until cleared or the page reloads.</p>}
    {problem&&<p role="alert" className="comparison-error">Cannot compare: {problem}</p>}
    {current&&<div className="comparison-actions"><button onClick={()=>act(()=>download('production-results.csv',resultsCsv(current),'text/csv'))}>Export results CSV</button><button onClick={()=>act(()=>download('production-events.csv',eventsCsv(current),'text/csv'))}>Export events CSV</button></div>}
    {comparison&&baseline&&current&&<>
      <p className="comparison-heading">Current minus baseline <span>{current.config.scenario?.fingerprint} − {baseline.config.scenario?.fingerprint}</span></p>
      <div className="comparison-totals"><span>Deliveries <strong>{delta(comparison.delivered)}</strong></span><span>Ending WIP <strong>{delta(comparison.wip)}</strong></span><span>Upstream <strong>{delta(comparison.upstream)}</strong></span><span>Modeled cost <strong>{money(comparison.totalCents)}</strong></span></div>
      <div className="results-table-scroll"><table><caption>Plant-calendar months · baseline → current (delta)</caption><thead><tr><th>Month</th><th>Deliveries</th><th>Ending WIP</th><th>Modeled cost</th></tr></thead><tbody>{comparison.months.map((m,i)=><tr key={m.month}><th>{m.month}{m.partial&&<small>Partial month</small>}</th><td>{comparison.baseline.months[i].deliveries} → {comparison.current.months[i].deliveries} ({delta(m.deliveries)})</td><td>{comparison.baseline.months[i].wip} → {comparison.current.months[i].wip} ({delta(m.wip)})</td><td>{money(comparison.baseline.months[i].totalCents)} → {money(comparison.current.months[i].totalCents)}<small>Δ {money(m.totalCents)}</small></td></tr>)}</tbody></table></div>
      <div className="results-table-scroll"><table><caption>Illustrative USD costs · actual event postings and accrued exposure</caption><thead><tr><th>Category</th><th>Baseline</th><th>Current</th><th>Delta</th></tr></thead><tbody>{costCategories.map(key=><tr key={key}><th>{key}</th><td>{money(comparison.baseline.costs.totals[key])}</td><td>{money(comparison.current.costs.totals[key])}</td><td>{money(comparison.costs[key])}</td></tr>)}</tbody></table></div>
      <p className="results-note">Accrued unfinished carrying / lateness: baseline {money(comparison.baseline.costs.unfinishedCarryingCents)} / {money(comparison.baseline.costs.unfinishedLatenessCents)}; current {money(comparison.current.costs.unfinishedCarryingCents)} / {money(comparison.current.costs.unfinishedLatenessCents)}. Future costs are unobserved.</p>
      {comparison.current.costs.totals.materials<comparison.baseline.costs.totals.materials&&<p className="comparison-error">Lower material spending means fewer or different kits issued, not an efficiency gain. Compare deliveries, WIP and unfinished exposure.</p>}
      <div className="results-table-scroll"><table><caption>Changed inputs · {comparison.differences.length===0?'Identical configuration':comparison.differences.length}</caption><thead><tr><th>Parameter</th><th>Baseline</th><th>Current</th></tr></thead><tbody>{comparison.differences.map(d=><tr key={d.path}><th>{d.path}</th><td>{d.baseline}</td><td>{d.current}</td></tr>)}</tbody></table></div>
      <div className="comparison-actions"><label>Aircraft <select aria-label="Comparison aircraft" value={serial} onChange={e=>setSerial(e.target.value)}>{[...new Set([...baseline.config.orders,...current.config.orders].map(o=>o.serialId))].map(id=><option key={id}>{id}</option>)}</select></label><button disabled={!current.fleet.aircraft.some(a=>a.id===serial)} onClick={()=>{client.returnToLive();onAircraft(serial);}}>Inspect current aircraft</button></div>
      <p className="results-note">Same date scale · teal work / transfer · dotted off shift · dashed red blocked. Hover for recorded activity and dates.</p>
      <AircraftTrace run={baseline} serial={serial} label="Baseline"/><AircraftTrace run={current} serial={serial} label="Current"/>
      <div className="results-table-scroll"><table><caption>{serial} · recorded aircraft milestones</caption><thead><tr><th>Activity</th><th>Baseline UTC</th><th>Current UTC</th></tr></thead><tbody>{[
        {id:'admitted',kind:'admitted',label:'Admitted'},
        ...current.config.recipe.tasks.filter(t=>t.kind==='transfer'||t.id==='engines'||t.id==='paint').map(t=>({id:t.id,kind:t.kind==='transfer'?'transfer-started':'task-started',label:t.label})),
        {id:'delivered',kind:'delivered',label:'Delivered'}
      ].map(m=><tr key={m.id}><th>{m.label}</th>{[baseline,current].map((run,i)=>{const event=run.events.find(e=>e.serialId===serial&&e.kind===m.kind&&(m.kind==='transfer-started'?e.transferId===`${serial}/${m.id}`:m.kind!=='task-started'||e.taskId===m.id));return <td key={i}>{event?new Date(event.instant).toISOString():'Not reached'}</td>;})}</tr>)}</tbody></table></div>
    </>}
  </div>;
}
