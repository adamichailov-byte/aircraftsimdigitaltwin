import {Temporal} from '@js-temporal/polyfill';
import type {FleetConfig,FleetSnapshot,FlowEvent} from './flow.ts';
import {costLedger,costCategories} from './costs.ts';
import {freezeConfiguration} from './scenario.ts';

// Bump these when engine rules or the bundled operating assumptions change.
export const modelVersion='A100-engine-AS15-v1';
export const assumptionVersion='A100-daily-jobs-v1';
export const canonical=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export type RecordedRun={modelVersion:string;assumptionVersion:string;config:FleetConfig;fleet:FleetSnapshot;events:readonly FlowEvent[]};
export function completionProblem(config:FleetConfig,fleet:FleetSnapshot|null,events:readonly FlowEvent[]){
  if(!fleet||fleet.instant!==config.recipe.end||!['complete','horizon-reached'].includes(fleet.status))return 'Run to the horizon before freezing or comparing. Blocked, cancelled and event-limited results are incomplete.';
  if(events.length!==fleet.eventCount||events.some((e,i)=>e.runId!==fleet.runId||e.sequence!==i+1))return 'The recorded event ledger is incomplete.';
  return '';
}
export function recordRun(config:FleetConfig,fleet:FleetSnapshot|null,events:readonly FlowEvent[]):RecordedRun{
  const problem=completionProblem(config,fleet,events);if(problem)throw new RangeError(problem);
  return freezeConfiguration(structuredClone({modelVersion,assumptionVersion,config,fleet:fleet!,events}));
}
export function compatibilityProblem(a:RecordedRun,b:RecordedRun){
  if(a.modelVersion!==b.modelVersion||a.assumptionVersion!==b.assumptionVersion||a.config.scenario?.version!==b.config.scenario?.version||a.config.costRates?.version!==b.config.costRates?.version)return 'Model or assumption versions differ. Re-run both scenarios with the same version.';
  if(a.config.recipe.start!==b.config.recipe.start||a.config.recipe.end!==b.config.recipe.end||a.config.recipe.calendar.timeZone!==b.config.recipe.calendar.timeZone)return 'Run horizons or plant time zones differ. Use identical dates and horizons.';
  if(canonical(a.config.materials.initial)!==canonical(b.config.materials.initial))return 'Opening inventory differs. Comparisons require the same empty plant and opening stock.';
  return completionProblem(a.config,a.fleet,a.events)||completionProblem(b.config,b.fleet,b.events);
}
export function runSummary(run:RecordedRun){
  const {config,fleet,events}=run,zone=config.recipe.calendar.timeZone;
  let month=Temporal.Instant.fromEpochMilliseconds(config.recipe.start).toZonedDateTimeISO(zone).toPlainDate().with({day:1});
  const months=[];
  while(month.toZonedDateTime(zone).epochMilliseconds<=config.recipe.end){
    const next=month.add({months:1}),begin=month.toZonedDateTime(zone).epochMilliseconds,end=next.toZonedDateTime(zone).epochMilliseconds;
    const from=Math.max(begin,config.recipe.start),to=Math.min(end,config.recipe.end+1);
    const visible=events.filter(e=>e.instant<to),delivered=new Set(visible.filter(e=>e.kind==='delivered').map(e=>e.serialId));
    const admitted=new Set(visible.filter(e=>e.kind==='admitted').map(e=>e.serialId));
    const ledger=costLedger({config,events,cutoff:fleet.instant,from,to,runId:fleet.runId});
    months.push({month:month.toString().slice(0,7),partial:from>begin||to<end,deliveries:visible.filter(e=>e.kind==='delivered'&&e.instant>=from).length,
      wip:[...admitted].filter(id=>!delivered.has(id)).length,costs:ledger.totals,totalCents:ledger.totalCents});
    month=next;
  }
  const costs=costLedger({config,events,cutoff:fleet.instant,runId:fleet.runId});
  const materials:Record<string,number>={};
  for(const e of events)if(e.kind==='material-issued'&&e.material)for(const allocation of e.material.allocations)materials[allocation.sku]=(materials[allocation.sku]??0)+allocation.quantity;
  return {months,costs,materials,delivered:fleet.delivered,wip:fleet.wip,upstream:fleet.upstream,unreleased:fleet.unreleased};
}
export function parameterDifferences(a:unknown,b:unknown,path=''): {path:string;baseline:string;current:string}[]{
  if(canonical(a)===canonical(b))return [];
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().flatMap(key=>parameterDifferences((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key],path?`${path}.${key}`:key));
  return [{path,baseline:canonical(a)??'unset',current:canonical(b)??'unset'}];
}
export function compareRuns(baseline:RecordedRun,current:RecordedRun){
  const problem=compatibilityProblem(baseline,current);if(problem)throw new RangeError(problem);
  const a=runSummary(baseline),b=runSummary(current);
  return {baseline:a,current:b,delivered:b.delivered-a.delivered,wip:b.wip-a.wip,upstream:b.upstream-a.upstream,
    costs:Object.fromEntries(costCategories.map(key=>[key,b.costs.totals[key]-a.costs.totals[key]])),totalCents:b.costs.totalCents-a.costs.totalCents,
    months:b.months.map((row,i)=>({month:row.month,partial:row.partial,deliveries:row.deliveries-a.months[i].deliveries,wip:row.wip-a.months[i].wip,totalCents:row.totalCents-a.months[i].totalCents})),
    differences:parameterDifferences(baseline.config.experiment??baseline.config,current.config.experiment??current.config)};
}
