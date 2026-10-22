import {Temporal} from '@js-temporal/polyfill';
import {FleetEngine} from './flow.ts';
import type {FleetConfig,FlowEvent} from './flow.ts';
import {costLedger,orderDueAt} from './costs.ts';
import {canonical,modelVersion,assumptionVersion} from './compare.ts';
import {sampleReceipt,variabilityVersion} from './random.ts';
import type {RealizedDraw,VariabilityPlan} from './random.ts';

export type BatchInput={current:FleetConfig;baseline?:FleetConfig;seeds:number[];taskTimes:boolean;receiptDelays:boolean};
export type RunMetrics={delivered:number;wip:number;upstream:number;unreleased:number;onTime:number;due:number;futureDue:number;totalCents:number;
  unfinishedCarryingCents:number;unfinishedLatenessCents:number;costs:Record<string,number>};
export type RunOutcome={seed:number;status:string;complete:boolean;cutoff:number;digest:string;eventCount:number;metrics:RunMetrics|null;draws:RealizedDraw[];error:string};
export type BatchActive={index:number;side:'current'|'baseline';seed:number;reference:boolean;instant:number};
export type BatchUpdate={active:BatchActive|null;outcome?:RunOutcome;elapsedMs:number;maxSliceMs:number;done:boolean};
export type BatchState={status:'idle'|'running'|'complete'|'cancelled'|'failed';input:BatchInput|null;references:Partial<Record<'current'|'baseline',RunOutcome>>;
  runs:Partial<Record<'current'|'baseline',RunOutcome>>[];active:BatchActive|null;elapsedMs:number;maxSliceMs:number;error:string};
export const emptyBatch=():BatchState=>({status:'idle',input:null,references:{},runs:[],active:null,elapsedMs:0,maxSliceMs:0,error:''});
export function seedSet(first:number,count:number){
  if(!Number.isInteger(count)||count<1||count>30||!Number.isInteger(first)||first<0||first+count-1>2147483647)throw new RangeError('Use 1–30 distinct seeds between 0 and 2147483647.');
  return Array.from({length:count},(_,i)=>first+i);
}
export function validateBatch(input:BatchInput){
  if(!input||!Array.isArray(input.seeds)||input.seeds.length<1||input.seeds.length>30||new Set(input.seeds).size!==input.seeds.length||input.seeds.some(n=>!Number.isInteger(n)||n<0||n>2147483647)||typeof input.taskTimes!=='boolean'||typeof input.receiptDelays!=='boolean')throw new RangeError('Use 1–30 distinct integer seeds and explicit variability options.');
  const a=input.current,b=input.baseline;
  if(a.variability||b?.variability)throw new RangeError('Start an experiment from unsampled scenario inputs.');
  if(b&&(a.recipe.start!==b.recipe.start||a.recipe.end!==b.recipe.end||a.recipe.calendar.timeZone!==b.recipe.calendar.timeZone||canonical(a.materials.initial)!==canonical(b.materials.initial)||a.scenario?.version!==b.scenario?.version||a.costRates?.version!==b.costRates?.version))throw new RangeError('Paired experiments require identical horizons, opening stock and assumption versions.');
}
/** Nearest rank, including even-sized median: rank ceil(p*n), one-based. */
export function quantile(values:readonly number[],p:number){
  if(!Number.isFinite(p)||p<0||p>1||values.some(n=>!Number.isFinite(n)))throw new RangeError('Invalid quantile inputs.');
  if(!values.length)return null;const sorted=values.slice().sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
}
export function distribution(values:readonly number[]){return {n:values.length,p10:quantile(values,.1),median:quantile(values,.5),p90:quantile(values,.9)};}
export function duePerformance(config:FleetConfig,events:readonly FlowEvent[],cutoff:number){
  const delivered=new Map(events.filter(e=>e.kind==='delivered'&&e.instant<=cutoff).map(e=>[e.serialId,e.instant]));
  let due=0,onTime=0,futureDue=0;
  for(const order of config.orders){const at=orderDueAt(config,order);if(at>cutoff){futureDue++;continue;}due++;
    if(delivered.has(order.serialId)&&delivered.get(order.serialId)!<=at)onTime++;}
  return {due,onTime,futureDue};
}
export function summarizeOutcomes(outcomes:readonly RunOutcome[]){
  const eligible=outcomes.filter(r=>r.complete&&r.metrics),metrics=eligible.map(r=>r.metrics!);
  const due=metrics.reduce((n,m)=>n+m.due,0),onTime=metrics.reduce((n,m)=>n+m.onTime,0);
  return {eligible:eligible.length,incomplete:outcomes.length-eligible.length,unfinished:metrics.filter(m=>m.wip+m.upstream+m.unreleased>0).length,
    delivered:distribution(metrics.map(m=>m.delivered)),wip:distribution(metrics.map(m=>m.wip)),cost:distribution(metrics.map(m=>m.totalCents)),
    onTime:distribution(metrics.filter(m=>m.due>0).map(m=>m.onTime/m.due)),due,onTimeCount:onTime,onTimeFraction:due?onTime/due:null};
}
export function pairedSummary(runs:BatchState['runs']){
  const pairs=runs.filter(r=>r.current?.complete&&r.baseline?.complete&&r.current.metrics&&r.baseline.metrics);
  return {n:pairs.length,delivered:distribution(pairs.map(r=>r.current!.metrics!.delivered-r.baseline!.metrics!.delivered)),
    wip:distribution(pairs.map(r=>r.current!.metrics!.wip-r.baseline!.metrics!.wip)),cost:distribution(pairs.map(r=>r.current!.metrics!.totalCents-r.baseline!.metrics!.totalCents))};
}
export function realizeConfiguration(source:FleetConfig,seed:number,options:{taskTimes:boolean;receiptDelays:boolean},draws:RealizedDraw[]){
  const plan:VariabilityPlan={version:variabilityVersion,seed,taskTimes:options.taskTimes,receiptDelays:options.receiptDelays},config=structuredClone(source);
  config.variability=plan;
  if(config.disruptions)config.disruptions={quality:{...config.disruptions.quality,seed}};
  config.materials={...config.materials,receipts:config.materials.receipts.map(receipt=>{
    const draw=sampleReceipt(plan,receipt.id);if(!draw)return receipt;draws.push(draw);
    const at=Temporal.Instant.fromEpochMilliseconds(receipt.at).toZonedDateTimeISO(config.recipe.calendar.timeZone).add({days:draw.value}).epochMilliseconds;
    return {...receipt,at,...(receipt.inspectionNotBefore===undefined?{}:{inspectionNotBefore:receipt.inspectionNotBefore+at-receipt.at})};
  })};
  return config;
}
export const batchVersions={modelVersion,assumptionVersion,variabilityVersion};
/** One engine/event ledger at a time. Completed results retain compact metrics + draws, never full histories. */
export async function runExperimentBatch(input:BatchInput,hooks:{yieldControl?:()=>Promise<void>;cancelled?:()=>boolean;update?:(update:BatchUpdate)=>void}={}){
  validateBatch(input);input=structuredClone(input);
  // Posted messages yield to the worker event loop without background timer clamping.
  const channel=hooks.yieldControl?null:new MessageChannel();
  const began=performance.now(),pause=hooks.yieldControl??(()=>new Promise<void>(resolve=>{channel!.port1.onmessage=()=>resolve();channel!.port2.postMessage(null);}));
  let maxSliceMs=0,lastUpdate=0;
  const state:BatchState={...emptyBatch(),status:'running',input,runs:input.seeds.map(()=>({}))};
  const sides=input.baseline?['baseline','current'] as const:['current'] as const;
  const jobs=[...sides.map(side=>({side,index:-1,reference:true,seed:input[side]!.disruptions?.quality.seed??42})),
    ...input.seeds.flatMap((seed,index)=>sides.map(side=>({side,index,reference:false,seed})))];
  const notify=(active:BatchActive|null,outcome?:RunOutcome,done=false)=>{state.active=active;state.elapsedMs=performance.now()-began;state.maxSliceMs=maxSliceMs;hooks.update?.({active,outcome,done,elapsedMs:state.elapsedMs,maxSliceMs});};
  try{for(const job of jobs){
    if(hooks.cancelled?.()){state.status='cancelled';return state;}
    const source=input[job.side]!,draws:RealizedDraw[]=[];
    let engine:FleetEngine|undefined,error='',config=source;
    const active={...job,instant:source.recipe.start};notify(active);await pause();
    const started=performance.now();
    try{
      config=job.reference?source:realizeConfiguration(source,job.seed,input,draws);
      engine=new FleetEngine(config,`experiment-${job.reference?'reference':job.seed}-${job.side}`,{onDraw:draw=>{if(draws.length>=10000)throw new RangeError('Realized-draw limit reached.');draws.push(draw);}});
      maxSliceMs=Math.max(maxSliceMs,performance.now()-started);
      while(engine.getSnapshot().nextEventInstant!==null){
        if(hooks.cancelled?.()){state.status='cancelled';state.active={...active,instant:engine.getSnapshot().instant};return state;}
        const slice=performance.now();
        do{engine.advanceTo(config.recipe.end,8);}while(engine.getSnapshot().nextEventInstant!==null&&performance.now()-slice<10);
        maxSliceMs=Math.max(maxSliceMs,performance.now()-slice);
        if(performance.now()-lastUpdate>=100){notify({...active,instant:engine.getSnapshot().instant});lastUpdate=performance.now();}
        await pause();
      }
      if(engine.getSnapshot().status==='complete')engine.advanceTo(config.recipe.end);
    }catch(reason){error=reason instanceof Error?reason.message:String(reason);}
    if(hooks.cancelled?.()){state.status='cancelled';return state;}
    const projectionStart=performance.now(),fleet=engine?.getSnapshot(),events=engine?.getEvents()??[];
    let metrics:RunMetrics|null=null;
    if(fleet)try{const costs=costLedger({config,events,cutoff:fleet.instant,runId:fleet.runId});
      metrics={delivered:fleet.delivered,wip:fleet.wip,upstream:fleet.upstream,unreleased:fleet.unreleased,...duePerformance(config,events,fleet.instant),totalCents:costs.totalCents,costs:costs.totals,unfinishedCarryingCents:costs.unfinishedCarryingCents,unfinishedLatenessCents:costs.unfinishedLatenessCents};
    }catch(reason){error=String(reason);}
    maxSliceMs=Math.max(maxSliceMs,performance.now()-projectionStart);
    const outcome:RunOutcome={seed:job.seed,status:error?'failed':fleet?.status??'failed',complete:!error&&fleet?.instant===config.recipe.end&&['complete','horizon-reached'].includes(fleet.status),
      cutoff:fleet?.instant??config.recipe.start,digest:fleet?.digest??'',eventCount:events.length,metrics,draws,error:error||fleet?.diagnosis||''};
    if(job.reference)state.references[job.side]=outcome;else state.runs[job.index][job.side]=outcome;
    notify({...active,instant:outcome.cutoff},outcome);await pause();
  }
  state.status='complete';notify(null,undefined,true);return state;
  }finally{channel?.port1.close();channel?.port2.close();}
}
