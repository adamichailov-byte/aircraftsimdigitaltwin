import {useMemo,useState,useSyncExternalStore} from 'react';
import type {FleetClient} from '../simulation/client';
import {batchVersions,distribution,pairedSummary,seedSet,summarizeOutcomes} from '../simulation/uncertainty';
import type {RunOutcome} from '../simulation/uncertainty';
import {assumptionVersion,modelVersion} from '../simulation/compare';

const number=(n:number|null)=>n===null?'N/A':new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n);
const dollars=(n:number|null)=>n===null?'N/A':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const percent=(n:number|null)=>n===null?'N/A':`${number(n*100)}%`;
type Spread=ReturnType<typeof distribution>;
function SpreadTable({title,rows}:{title:string;rows:{label:string;spread:Spread;reference:number|null;format:(n:number|null)=>string}[]}){
  return <div className="results-table-scroll"><table><caption>{title}</caption><thead><tr><th>Measure</th><th>Single reference</th><th>Median</th><th>p10</th><th>p90</th><th>n</th></tr></thead><tbody>{rows.map(r=><tr key={r.label}><th>{r.label}</th><td>{r.format(r.reference)}</td><td>{r.format(r.spread.median)}</td><td>{r.format(r.spread.p10)}</td><td>{r.format(r.spread.p90)}</td><td>{r.spread.n}</td></tr>)}</tbody></table></div>;
}
export function Experiments({client}:{client:FleetClient}){
  const batch=useSyncExternalStore(client.experiments.subscribe,client.experiments.getSnapshot),view=useSyncExternalStore(client.subscribe,client.getSnapshot);
  const [count,setCount]=useState(batch.input?.seeds.length??10),[first,setFirst]=useState(batch.input?.seeds[0]??42);
  const [tasks,setTasks]=useState(batch.input?.taskTimes??false),[receipts,setReceipts]=useState(batch.input?.receiptDelays??false),[paired,setPaired]=useState(!!batch.input?.baseline);
  const [error,setError]=useState(''),[detail,setDetail]=useState<{index:number;side:'current'|'baseline'}|null>(null),[limit,setLimit]=useState(40);
  const running=batch.status==='running',baseline=client.baseline,input=batch.input;
  const outcomes=useMemo(()=>batch.runs.flatMap(r=>r.current?[r.current]:[]),[batch.runs]),summary=useMemo(()=>summarizeOutcomes(outcomes),[outcomes]);
  const pairedResult=useMemo(()=>pairedSummary(batch.runs),[batch.runs]);
  const completedJobs=Object.keys(batch.references).length+batch.runs.reduce((n,row)=>n+Object.keys(row).length,0);
  const progressTotal=input?(input.seeds.length+1)*(input.baseline?2:1):1;
  const activeProgress=input&&batch.active&&running?Math.max(0,Math.min(1,(batch.active.instant-input.current.recipe.start)/(input.current.recipe.end-input.current.recipe.start))):0;
  const start=()=>{try{
    if(paired&&(!baseline||baseline.modelVersion!==modelVersion||baseline.assumptionVersion!==assumptionVersion))throw new RangeError('Freeze a baseline from this model version in Compare first.');
    client.play(false);client.experiments.start({current:client.config,...(paired?{baseline:baseline!.config}:{}),seeds:seedSet(first,count),taskTimes:tasks,receiptDelays:receipts});setError('');setDetail(null);
  }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}};
  const exportBatch=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({versions:batchVersions,...batch},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='modeled-experiment-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const selected=detail?batch.runs[detail.index]?.[detail.side]:null;
  const rows=(side:'current'|'baseline')=>{
    const samples=batch.runs.flatMap(r=>r[side]?[r[side]!]:[]),s=summarizeOutcomes(samples),reference=batch.references[side]?.complete?batch.references[side]!.metrics:null;
    return <><SpreadTable title={`${side==='current'?'Current scenario':'Paired baseline'} · ${s.eligible} full-horizon / ${input!.seeds.length} requested`} rows={[
      {label:'Delivered',spread:s.delivered,reference:reference?.delivered??null,format:number},
      {label:'Ending WIP',spread:s.wip,reference:reference?.wip??null,format:number},
      {label:'Modeled cost',spread:s.cost,reference:reference?.totalCents??null,format:dollars},
      {label:'Due orders on time',spread:s.onTime,reference:reference?.due?reference.onTime/reference.due:null,format:percent}
    ]}/><p className="results-note">{s.incomplete} incomplete runs excluded from these full-horizon quantiles; {s.unfinished} full-horizon runs have unfinished orders. Pooled on time: {s.onTimeCount} / {s.due} due orders ({percent(s.onTimeFraction)}).</p></>;
  };
  const renderOutcome=(outcome:RunOutcome|undefined)=>outcome?<>{outcome.status}{!outcome.complete&&<strong className="comparison-error"> · incomplete</strong>}<small>{outcome.error}</small></>:'Not run';
  return <div className="experiments">
    <h3>Modeled variability</h3><p className="results-note">Synthetic ranges, not validated forecast confidence. Experiments use separate full-horizon runs; the scene and live history stay unchanged.</p>
    <fieldset disabled={running} className="experiment-controls"><legend>Experiment inputs</legend>
      <label>Replications (1–30)<input type="number" min="1" max="30" aria-label="Experiment replications" value={Number.isFinite(count)?count:''} onChange={e=>setCount(e.target.value===''?NaN:Number(e.target.value))}/></label>
      <label>First seed<input type="number" min="0" max="2147483647" aria-label="Experiment first seed" value={Number.isFinite(first)?first:''} onChange={e=>setFirst(e.target.value===''?NaN:Number(e.target.value))}/></label>
      <label className="experiment-check"><input type="checkbox" checked={tasks} onChange={e=>setTasks(e.target.checked)}/>Task times · triangular 0.8–1.2×</label>
      <label className="experiment-check"><input type="checkbox" checked={receipts} onChange={e=>setReceipts(e.target.checked)}/>Receipt delays · 0–3 calendar days</label>
      <label className="experiment-check"><input type="checkbox" disabled={!baseline&&!paired} checked={paired} onChange={e=>setPaired(e.target.checked)}/>Pair with frozen baseline{baseline?` ${baseline.config.scenario?.fingerprint}`:' · freeze one in Compare'}</label>
    </fieldset>
    <div className="comparison-actions"><button disabled={running||view.state==='computing'||view.state==='starting'} onClick={start}>Run experiment</button>{running&&<button onClick={()=>client.experiments.cancel()}>Cancel experiment</button>}{input&&<button onClick={exportBatch}>Save experiment evidence</button>}</div>
    {error&&<p role="alert" className="comparison-error">{error}</p>}
    <p role="status" className="results-note">{batch.status==='idle'?'Variability is off until you select it and run an experiment.':`${batch.status} · ${outcomes.length} current outcomes recorded / ${input?.seeds.length} requested${batch.active&&running?` · ${batch.active.reference?'single reference':`seed ${batch.active.seed}`} · ${batch.active.side} · ${new Intl.DateTimeFormat('en-US',{timeZone:input!.current.recipe.calendar.timeZone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(batch.active.instant)}`:''}`}</p>
    {running&&<progress className="experiment-progress" aria-label="Experiment progress" max={progressTotal} value={Math.min(progressTotal,completedJobs+activeProgress)}/>}
    {batch.error&&<p role="alert" className="comparison-error">{batch.error}</p>}
    {input&&<>
      <p className="results-note">Saved inputs {input.current.scenario?.fingerprint??input.current.name} · opening WIP 0 · {new Date(input.current.recipe.start).toISOString().slice(0,10)} — {new Date(input.current.recipe.end).toISOString().slice(0,10)} · {input.current.recipe.calendar.timeZone}. Seeds {input.seeds.join(', ')}. {input.taskTimes?'Task time variation on. ':''}{input.receiptDelays?'Receipt variation on. ':''}{!input.taskTimes&&!input.receiptDelays?'No task/receipt variation. ':''}Quality checks retain the applied probability.</p>
      {input.current.scenario?.fingerprint!==client.config.scenario?.fingerprint&&<p className="comparison-error">These results use saved inputs; the applied scene scenario has changed.</p>}
      <p className="results-note">{batchVersions.modelVersion} · {batchVersions.assumptionVersion} · {batchVersions.variabilityVersion}</p>
      {(['baseline','current'] as const).filter(side=>batch.references[side]&&!batch.references[side]!.complete).map(side=><p key={side} className="comparison-error">{side} single reference is incomplete: {batch.references[side]!.status}. No full-horizon reference is available.</p>)}
      {input.baseline&&rows('baseline')}{rows('current')}
      {input.baseline&&<SpreadTable title={`Paired current − baseline · ${pairedResult.n} complete pairs (not differences of quantiles)`} rows={[
        {label:'Delivery delta',spread:pairedResult.delivered,reference:null,format:number},{label:'WIP delta',spread:pairedResult.wip,reference:null,format:number},{label:'Cost delta',spread:pairedResult.cost,reference:null,format:dollars}
      ]}/>}
      <p className="results-note">On time = delivered by its due date among all orders due by cutoff. Unfinished due orders count as misses; future-due orders are separate. p10 / median / p90 use empirical nearest rank. Completed runs with unfinished WIP remain included.</p>
      <div className="results-table-scroll"><table><caption>Every requested seed · {summary.incomplete} current incomplete outcomes retained</caption><thead><tr><th>Seed / run</th><th>Status</th><th>Delivered / WIP</th><th>On time / due</th><th>Future due</th><th>Modeled cost</th></tr></thead><tbody>{batch.runs.flatMap((pair,index)=>(input.baseline?['baseline','current'] as const:['current'] as const).map(side=>{const r=pair[side],m=r?.metrics;
        return <tr key={`${index}/${side}`}><th><button aria-label={`Inspect ${side} seed ${input.seeds[index]}`} disabled={!r} onClick={()=>{setDetail({index,side});setLimit(40);}}>{input.seeds[index]} · {side}</button></th><td>{renderOutcome(r)}</td><td>{m?`${m.delivered} / ${m.wip}`:'—'}{m&&<small>{m.upstream} upstream · {m.unreleased} unreleased</small>}</td><td>{m?`${m.onTime} / ${m.due}`:'—'}</td><td>{m?.futureDue??'—'}</td><td>{m?dollars(m.totalCents):'—'}</td></tr>;
      }))}</tbody></table></div>
      {selected&&<section className="results-evidence" aria-label="Experiment run evidence"><div className="results-evidence-heading"><h3>{detail!.side} · seed {selected.seed}</h3><button onClick={()=>setDetail(null)}>Close run evidence</button></div>
        <p className="results-note">{selected.status} · observed through {new Date(selected.cutoff).toISOString()} · {selected.eventCount} events · digest {selected.digest||'not committed'}. {selected.draws.length} realized inputs. {selected.metrics&&<>Unfinished carrying {dollars(selected.metrics.unfinishedCarryingCents)}; unfinished lateness {dollars(selected.metrics.unfinishedLatenessCents)}.</>}</p>
        <div className="results-table-scroll"><table><caption>Keyed draws · task values in milliseconds, receipt values in calendar days</caption><thead><tr><th>Stable key</th><th>Uniform draw</th><th>Realized value</th></tr></thead><tbody>{selected.draws.slice(0,limit).map(d=><tr key={d.key}><th>{d.key}</th><td>{d.uniform.toFixed(8)}</td><td>{d.value}</td></tr>)}</tbody></table></div>{selected.draws.length>limit&&<button onClick={()=>setLimit(limit+40)}>Show 40 more draws</button>}
      </section>}
    </>}
  </div>;
}
