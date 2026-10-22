import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {FleetClient} from '../simulation/client';
import {productionReport,localReportDate,reportDateInstant} from '../simulation/metrics';
import type {Contribution} from '../simulation/metrics';
import {residenceKinds} from '../simulation/report-intervals';
import type {ResidenceKind} from '../simulation/report-intervals';
import {materialCatalog} from '../simulation/fixtures/a100';
import {stationPoses} from '../simulation/transfers';
import {CostBreakdown} from './CostBreakdown';
import {Comparison} from './Comparison';
import {Experiments} from './Experiments';

const kinds:Record<ResidenceKind,string>={productive:'Productive work',material:'Material-held',resource:'Crew / equipment wait',equipment:'Equipment outage',quality:'Quality hold',daily:'Daily start window',buffer:'Handoff buffer',flow:'Transfer wait',offshift:'Off shift / break',elapsed:'Elapsed process',offsite:'Offsite / stand retained',transfer:'Tow / tail clearance',other:'Other residence'};
const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const hours=(n:number)=>`${number.format(n/3600000)}h`;
const days=(n:number)=>`${number.format(n/86400000)}d`;
type Detail={kind:'deliveries'|'admissions'|'releases'|'backlog'|'openingWip'|'endingWip'|'flow'|'month'|'parts'|'openingParts'|'partsToOpening'|'station';key?:string;state?:ResidenceKind};
const tabs=['Production','Parts','Stations','Costs','Compare','Experiments'] as const;

export function Results({client,onClose,onAircraft}:{client:FleetClient;onClose:()=>void;onAircraft:(id:string)=>void}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot),fleet=view.displayFleet,config=client.config;
  const [tab,setTab]=useState<typeof tabs[number]>('Production'),[fromDate,setFromDate]=useState(''),[throughDate,setThroughDate]=useState('');
  const [detail,setDetail]=useState<Detail|null>(null),[limit,setLimit]=useState(40);
  const heading=useRef<HTMLHeadingElement>(null),tabRefs=useRef<(HTMLButtonElement|null)[]>([]);
  const cutoff=fleet?.instant??config.recipe.start,zone=config.recipe.calendar.timeZone;
  const from=fromDate?reportDateInstant(fromDate,zone):config.recipe.start,to=throughDate?reportDateInstant(throughDate,zone,true):config.recipe.end+1;
  const valid=from<=cutoff&&to>from;
  const report=useMemo(()=>tab!=='Compare'&&tab!=='Experiments'&&fleet&&valid?productionReport({config,fleet,events:view.history.events,from,to,cutoff}):null,[config,fleet,view.history.events,from,to,cutoff,valid,tab]);
  const stamp=useMemo(()=>new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),[zone]);
  useEffect(()=>{const previous=document.activeElement;heading.current?.focus();return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
  useEffect(()=>{setFromDate('');setThroughDate('');setDetail(null);},[view.runId]);
  useEffect(()=>setLimit(40),[detail,from,to,cutoff]);
  const choose=(next:Detail)=>{setDetail(next);setLimit(40);};
  const stationName=(id:string)=>stationPoses[id]?.label??id;
  let evidence:Contribution[]=[],title='';
  if(report&&detail){
    if(['deliveries','admissions','releases','backlog','openingWip','endingWip'].includes(detail.kind)){
      const key=detail.kind as 'deliveries'|'admissions'|'releases'|'backlog'|'openingWip'|'endingWip';evidence=report[key];
      title={deliveries:'Deliveries in period',admissions:'Admissions in period',releases:'Order releases in period',backlog:'Released orders waiting upstream',openingWip:'Opening WIP',endingWip:'Ending WIP · unfinished age'}[key];
    }else if(detail.kind==='flow'){evidence=report.deliveries.filter(r=>r.durationMs!==undefined);title='Completed flow time · admission to delivery';}
    else if(detail.kind==='month'){evidence=report.months.find(m=>m.key===detail.key)?.deliveries??[];title=`${detail.key} deliveries`;}
    else if(detail.kind==='parts'||detail.kind==='openingParts'||detail.kind==='partsToOpening'){
      const row=report.parts.find(p=>p.sku===detail.key);evidence=(detail.kind==='openingParts'?row?.openingIssues:detail.kind==='partsToOpening'?row?.issues.filter(e=>report.openingWip.some(w=>w.serialId===e.serialId)):row?.issues)??[];
      title=`${materialCatalog[detail.key!]?.label??detail.key} · ${detail.kind==='parts'?'issued in period':detail.kind==='partsToOpening'?'period issues to opening WIP':'already issued to opening WIP'}`;
    }else if(detail.kind==='station'){
      evidence=report.intervals.filter(r=>r.station===detail.key&&(!detail.state||r.kind===detail.state)).map(r=>({serialId:r.serialId,at:r.from,to:r.to,durationMs:r.to-r.from,label:`${kinds[r.kind]} · ${r.label}`,eventIds:r.eventIds}));
      title=`${stationName(detail.key!)} · ${detail.state?kinds[detail.state]:'residence evidence'}`;
    }
  }
  const station=report&&detail?.kind==='station'?report.stations.find(s=>s.id===detail.key):null;
  const mostHeld=report?.stations.slice().sort((a,b)=>b.materialMs-a.materialMs)[0];
  return <section className="results-workspace" aria-label="Production results" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
    <header><div><span className="eyebrow">RECORDED PRODUCTION · {view.history.cursor!==null?'HISTORY':'CURRENT RUN'}</span><h2 ref={heading} tabIndex={-1}>Production results</h2></div><button onClick={onClose} aria-label="Close production results">Close</button></header>
    <p className="results-context">{config.name} · {fleet?.status??'Starting'} · seed {config.disruptions?.quality.seed??'none'} · synthetic A100 inputs</p>
    {tab!=='Compare'&&tab!=='Experiments'&&<div className="results-range"><label>From<input type="date" aria-label="Report from date" value={fromDate||localReportDate(config.recipe.start,zone)} min={localReportDate(config.recipe.start,zone)} max={localReportDate(cutoff,zone)} onInput={e=>{setFromDate(e.currentTarget.value);setDetail(null);}}/></label>
      <label>Through<input type="date" aria-label="Report through date" value={throughDate||localReportDate(cutoff,zone)} min={fromDate||localReportDate(config.recipe.start,zone)} max={localReportDate(cutoff,zone)} onInput={e=>{setThroughDate(e.currentTarget.value);setDetail(null);}}/></label>
      <button onClick={()=>{setFromDate('');setThroughDate('');setDetail(null);}}>Through scene time</button>
      <small>Cutoff {stamp.format(cutoff)} · {zone}</small></div>}
    <div className="results-tabs" role="tablist" aria-label="Production report sections">{tabs.map((name,index)=><button key={name} ref={node=>{tabRefs.current[index]=node;}} role="tab" id={`results-tab-${index}`} aria-controls="results-content" aria-selected={tab===name} tabIndex={tab===name?0:-1}
      onClick={()=>{setTab(name);setDetail(null);}} onKeyDown={e=>{let next=index;if(e.key==='ArrowRight')next=(index+1)%tabs.length;else if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();e.stopPropagation();setTab(tabs[next]);setDetail(null);tabRefs.current[next]?.focus();}}>{name}</button>)}</div>
    <div className="results-content" id="results-content" role="tabpanel" aria-labelledby={`results-tab-${tabs.indexOf(tab)}`}>
      {tab==='Compare'?<Comparison client={client} onAircraft={onAircraft}/>:tab==='Experiments'?<Experiments client={client}/>:!valid?<p role="alert">Choose a start date at or before the scene time and an end date after the start.</p>:!report?<p>Waiting for the first recorded simulation state.</p>:<>
        <p className="results-window">{stamp.format(report.from)} — {stamp.format(report.to)} · observed period only</p>
        {tab==='Costs'&&<CostBreakdown config={config} events={view.history.events} from={from} to={to} cutoff={cutoff} runId={view.runId} onAircraft={onAircraft}/>}
        {tab==='Production'&&<>
          <div className="results-summary">{([['Deliveries',report.deliveries.length,'deliveries'],['Released',report.releases.length,'releases'],['Admitted',report.admissions.length,'admissions'],['Upstream at end',report.backlog.length,'backlog'],['WIP at end',report.endingWip.length,'endingWip']] as const).map(([label,value,kind])=><button key={kind} onClick={()=>choose({kind})}><span>{label}</span><strong>{value}</strong></button>)}</div>
          <div className="results-reconcile"><button onClick={()=>choose({kind:'openingWip'})}>{report.openingWip.length} opening WIP</button><span>+</span><button onClick={()=>choose({kind:'admissions'})}>{report.admissions.length} admissions</button><span>=</span><button onClick={()=>choose({kind:'deliveries'})}>{report.deliveries.length} deliveries</button><span>+</span><button onClick={()=>choose({kind:'endingWip'})}>{report.endingWip.length} ending WIP</button></div>
          <p className="results-flow">Completed flow time <button onClick={()=>choose({kind:'flow'})}><strong>{report.flowTimeMs===null?'N/A':days(report.flowTimeMs)}</strong> · {report.flowTimeCount} delivered aircraft</button><span>Unfinished aircraft appear in ending WIP with their age; they do not enter this average.</span></p>
          <div className="results-table-scroll"><table><caption>Deliveries by plant-calendar month</caption><thead><tr><th scope="col">Month</th><th scope="col">Coverage</th><th scope="col">Delivered</th></tr></thead><tbody>{report.months.map(month=><tr key={month.key}><th scope="row">{new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'long',year:'numeric'}).format(reportDateInstant(`${month.key}-01`,zone))}</th><td>{month.partial?'Partial month':'Full month'}</td><td><button className="results-value" aria-label={`Inspect ${month.key} deliveries`} onClick={()=>choose({kind:'month',key:month.key})}>{month.deliveries.length} <span aria-hidden="true">↗</span></button></td></tr>)}</tbody></table></div>
        </>}
        {tab==='Parts'&&<><p className="results-note">Aggregate units are reported by SKU. “Opening WIP” is material already issued before this period to aircraft still in production at its start; it is not added to period consumption.</p>
          <div className="results-table-scroll"><table><caption>Material issues · one unit basis per SKU</caption><thead><tr><th scope="col">Part / kit</th><th scope="col">Issued in period</th><th scope="col">Of which to opening WIP</th><th scope="col">Already in opening WIP</th></tr></thead><tbody>{report.parts.map(part=><tr key={part.sku}><th scope="row">{materialCatalog[part.sku]?.label??part.sku}<small>{part.sku}</small></th>
            <td><button className="results-value" aria-label={`Inspect ${part.sku} period issues`} onClick={()=>choose({kind:'parts',key:part.sku})}>{part.issued} ↗</button></td><td><button className="results-value" aria-label={`Inspect ${part.sku} period issues to opening WIP`} onClick={()=>choose({kind:'partsToOpening',key:part.sku})}>{part.issuedToOpeningWip} ↗</button></td><td><button className="results-value" aria-label={`Inspect ${part.sku} opening WIP issues`} onClick={()=>choose({kind:'openingParts',key:part.sku})}>{part.openingWipIssued} ↗</button></td></tr>)}</tbody></table></div></>}
        {tab==='Stations'&&<>
          <p className="results-note">{mostHeld&&mostHeld.materialMs>0?<>Most material-held time: <button onClick={()=>choose({kind:'station',key:mostHeld.id,state:'material'})}>{stationName(mostHeld.id)} · {hours(mostHeld.materialMs)}</button>.</>:'No material-held station intervals in this period.'} A long residence alone does not establish a bottleneck.</p>
          <div className="results-table-scroll"><table><caption>Physical station residence · clock hours; utilization uses staffed opportunity</caption><thead><tr><th scope="col">Station</th><th scope="col">Occupied</th><th scope="col">Productive</th><th scope="col">Material-held</th><th scope="col">Utilization</th></tr></thead><tbody>{report.stations.map(s=><tr key={s.id}><th scope="row"><button onClick={()=>choose({kind:'station',key:s.id})}>{stationName(s.id)}</button></th>
            <td><button className="results-value" onClick={()=>choose({kind:'station',key:s.id})}>{hours(s.occupiedMs)}</button></td><td><button className="results-value" onClick={()=>choose({kind:'station',key:s.id,state:'productive'})}>{hours(s.productiveMs)}</button></td><td><button className={`results-value${s.materialMs?' results-held':''}`} onClick={()=>choose({kind:'station',key:s.id,state:'material'})}>{hours(s.materialMs)}</button></td><td><button className="results-value" onClick={()=>choose({kind:'station',key:s.id,state:'productive'})}>{s.utilization===null?'N/A':`${number.format(s.utilization*100)}%`}</button><small>{hours(s.availableMs)} opportunity</small></td></tr>)}</tbody></table></div>
          <p className="results-note">Utilization = productive station time ÷ scheduled working time on shifts with capacity for at least one staffed station job. Breaks are excluded; equipment downtime stays in the denominator. Zero opportunity is N/A. Cure and offsite flight are separate from staffed production.</p>
        </>}
        {detail&&<section className="results-evidence" aria-label="Report evidence"><div className="results-evidence-heading"><h3>{title}</h3><button onClick={()=>setDetail(null)} aria-label="Close report evidence">Close detail</button></div>
          {station&&<div className="results-breakdown">{residenceKinds.filter(kind=>station.breakdown[kind]>0).map(kind=><button key={kind} aria-pressed={detail.state===kind} onClick={()=>choose({kind:'station',key:station.id,state:kind})}>{kinds[kind]} <strong>{hours(station.breakdown[kind])}</strong></button>)}</div>}
          <p className="results-note">{evidence.length} contributing {detail.kind==='station'?'intervals':'records'}. Aircraft details open at the scene time shown in the clock.</p>
          {evidence.length===0?<p>No contributing activity in this period.</p>:<><div className="results-table-scroll"><table><thead><tr><th scope="col">Aircraft</th><th scope="col">Activity / source</th><th scope="col">Recorded time</th><th scope="col">Contribution</th></tr></thead><tbody>{evidence.slice(0,limit).map((row,index)=><tr key={`${row.serialId}/${row.at}/${index}`}><th scope="row">{fleet?.aircraft.some(a=>a.id===row.serialId)?<button aria-label={`Inspect aircraft ${row.serialId}`} onClick={()=>onAircraft(row.serialId)}>{row.serialId} ↗</button>:row.serialId}</th>
            <td>{row.label}</td><td>{stamp.format(row.at)}{row.to!==undefined&&<> — {stamp.format(row.to)}</>}</td><td>{row.quantity!==undefined?`${row.quantity} units`:row.durationMs!==undefined?(detail.kind==='flow'||detail.kind==='endingWip'?days(row.durationMs):hours(row.durationMs)):'1 aircraft'}</td></tr>)}</tbody></table></div>{evidence.length>limit&&<button onClick={()=>setLimit(limit+40)}>Show 40 more records</button>}</>}
        </section>}
      </>}
    </div>
  </section>;
}
