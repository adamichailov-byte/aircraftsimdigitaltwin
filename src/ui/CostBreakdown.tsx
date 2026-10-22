import {useEffect,useMemo,useRef,useState} from 'react';
import type {FleetConfig,FlowEvent} from '../simulation/flow';
import {costCategories,costLedger} from '../simulation/costs';
import type {CostCategory} from '../simulation/costs';
import assumptionsUrl from '../../docs/cost-assumptions.html?url';

const labels:Record<CostCategory,string>={labor:'Scheduled labor',overtime:'Overtime premium',materials:'Consumed materials',carrying:'WIP carrying',lateness:'Accrued lateness'};
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const quantity=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:4}).format(n);
const elapsed=(ms:number)=>`${Math.floor(ms/3600000)}h ${Math.floor(ms%3600000/60000)}m ${(ms%60000/1000).toFixed(3)}s`;
export function CostBreakdown({config,events,cutoff,from,to,runId,onAircraft}:{config:FleetConfig;events:readonly FlowEvent[];cutoff:number;from?:number;to?:number;runId:string;onAircraft?:(id:string)=>void}){
  const report=useMemo(()=>costLedger({config,events,cutoff,from,to,runId}),[config,events,cutoff,from,to,runId]);
  const [category,setCategory]=useState<CostCategory|null>(null),[limit,setLimit]=useState(40),[sourceId,setSourceId]=useState<string|null>(null);
  const sourceRef=useRef<HTMLElement>(null);
  useEffect(()=>{setLimit(40);setSourceId(null);},[category,from,to,runId]);
  useEffect(()=>{if(sourceId){sourceRef.current?.focus({preventScroll:true});sourceRef.current?.scrollIntoView({block:'nearest'});}},[sourceId]);
  const stamp=new Intl.DateTimeFormat('en-US',{timeZone:config.recipe.calendar.timeZone,month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const rows=report.rows.filter(r=>r.category===category),source=rows.find(r=>r.id===sourceId);
  return <section className="cost-ledger" aria-label="Modeled cost ledger">
    <div className="results-evidence-heading"><h3>Modeled costs · {money(report.totalCents)}</h3><a href={assumptionsUrl} target="_blank" rel="noreferrer">Cost assumptions ↗</a></div>
    <p className="results-note">Illustrative USD · {report.rates.version} · total modeled cost is not delay cost</p>
    <div className="results-table-scroll"><table><caption>Charges accrued through {stamp.format(report.to)}</caption><thead><tr><th>Category</th><th>Applied rate</th><th>Amount</th></tr></thead><tbody>{costCategories.map(id=><tr key={id}><th scope="row">{labels[id]}</th><td>{id==='labor'?`${money(report.rates.laborPerHourCents)} / person-hour`:id==='overtime'?`${money(report.rates.overtimePremiumPerHourCents)} / overtime person-hour`:id==='carrying'?`${money(report.rates.carryingPerDayCents)} / aircraft-day`:id==='lateness'?`${money(report.rates.latenessPerDayCents)} / aircraft-day`:'Per-SKU rate at issue'}</td><td><button type="button" className="results-value" aria-label={`Inspect ${labels[id]} cost`} onClick={()=>setCategory(id)}>{money(report.totals[id])} ↗</button></td></tr>)}</tbody></table></div>
    <p className="results-note">Paid labor partitions: {money(report.productiveLaborCents)} assigned + {money(report.idleLaborCents)} idle. Included above.</p>
    <p className="results-note">Unfinished exposure included: {money(report.unfinishedCarryingCents)} carrying · {money(report.unfinishedLatenessCents)} lateness. No future completion assumed.</p>
    {category&&<section className="results-evidence" aria-label="Cost evidence"><div className="results-evidence-heading"><h3>{labels[category]} · charge records</h3><button type="button" onClick={()=>{setCategory(null);setSourceId(null);}}>Close detail</button></div>
      {rows.length===0?<p>No charges in this period.{category==='overtime'&&' No shifts are designated overtime in the default scenario.'}</p>:<>
        <div className="results-table-scroll"><table><thead><tr><th>Aircraft / activity</th><th>Quantity × rate</th><th>Accrual interval</th><th>Charge</th></tr></thead><tbody>{rows.slice(0,limit).map(row=><tr key={row.id}><th scope="row">{row.serialId&&<>{onAircraft?<button type="button" onClick={()=>onAircraft(row.serialId!)}>{row.serialId} ↗</button>:row.serialId}<br/></>}{row.label}<small>{row.unfinished?'Unfinished at cutoff':row.serialId?'Delivered at cutoff':'Plant-wide capacity'}</small></th><td>{quantity(row.quantity)} {row.unit}<br/>× {money(row.rateCents)}<small>{row.sku??'Cumulative posting rounded to cents'}</small></td><td>{stamp.format(row.from)}{row.to!==row.from&&<><br/>— {stamp.format(row.to)}</>}</td><td><button type="button" className="results-value" aria-label={`View cost source ${row.id}`} onClick={()=>setSourceId(row.id)}>{money(row.amountCents)} ↗</button></td></tr>)}</tbody></table></div>
        {rows.length>limit&&<button type="button" onClick={()=>setLimit(limit+40)}>Show 40 more records</button>}
      </>}
      {source&&<section ref={sourceRef} tabIndex={-1} className="cost-source" aria-label="Cost source"><div className="results-evidence-heading"><h4>{source.serialId??'Plant'} · source</h4><button type="button" onClick={()=>setSourceId(null)}>Close source</button></div><p>{source.source}</p><p>{source.unit==='aircraft-days'?`${elapsed(source.to-source.from)} × ${money(source.rateCents)} / 24 hours`:`${source.quantity.toPrecision(12)} ${source.unit} × ${money(source.rateCents)}`} = {money(source.amountCents)} · {report.rates.version}</p>{source.eventIds.map(id=>{const event=events.find(e=>e.id===id);return <p key={id}>{event?`${stamp.format(event.instant)} · ${event.label}`:'Recorded event'}<small>{id}</small></p>;})}</section>}
    </section>}
  </section>;
}
