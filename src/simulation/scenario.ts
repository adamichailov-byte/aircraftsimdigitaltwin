import {Temporal} from '@js-temporal/polyfill';
import {buildExperiment,defaultSettings,experimentStations} from './experiments.ts';
import type {ExperimentSettings} from './experiments.ts';
import {compileCalendar,defaultCalendar,localInstant} from './calendar.ts';
import type {CalendarDefinition} from './types.ts';
import type {FleetConfig} from './flow.ts';
import {materialCatalog} from './fixtures/a100.ts';

export type ScenarioDraft={version:1;seed:number;supply:{sku:string;receiptId:string;delayDays:number;quantityPercent:number};
  crews:Record<string,Record<string,number>>;factors:Record<string,number>;failureProbability:number;
  outage:{equipmentId:string;start:string;end:string}|null;calendar:CalendarDefinition};
export type ScenarioIdentity={version:'A100-scenario-v1';seed:number;fingerprint:string};
export function defaultScenario(base:FleetConfig=buildExperiment(defaultSettings())):ScenarioDraft{
  return {version:1,seed:base.disruptions?.quality.seed??42,supply:{sku:'engine',receiptId:base.materials.receipts.find(r=>r.lot.sku==='engine')?.id??'',delayDays:0,quantityPercent:100},
    crews:{},factors:{},failureProbability:0,outage:null,calendar:structuredClone(defaultCalendar)};
}
function object(value:unknown,label:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new RangeError(`${label} must be an object.`);
  return value as Record<string,unknown>;
}
function keys(value:Record<string,unknown>,allowed:readonly string[],label:string){
  if(Object.keys(value).some(key=>!allowed.includes(key)))throw new RangeError(`${label} contains an unsupported field.`);
}
function number(value:unknown,min:number,max:number,label:string,integer=false):asserts value is number{
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw new RangeError(`${label}: enter ${integer?'a whole number':'a number'} from ${min} to ${max}.`);
}
function dateAt(instant:number,zone:string){return Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(zone);}
function workingDates(config:FleetConfig){
  const zone=config.recipe.calendar.timeZone,seen=new Set<string>();
  return config.recipe.calendar.shifts.filter(s=>s.start>=config.recipe.start&&s.start<config.recipe.end&&!seen.has(dateAt(s.start,zone).toPlainDate().toString())&&seen.add(dateAt(s.start,zone).toPlainDate().toString())).map(s=>s.start);
}
/** Freeze the input snapshot, not a live mutable scenario store. */
export function freezeConfiguration<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freezeConfiguration);Object.freeze(value);}
  return value;
}
function fingerprint(value:unknown):string{
  const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,item])=>[k,canonical(item)])):v;
  let hash=2166136261;for(const char of JSON.stringify(canonical(value)))hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  return hash.toString(16).padStart(8,'0');
}
/** Validate the entire draft before touching any client, worker or historical result. */
export function applyScenario(source:FleetConfig,input:unknown):FleetConfig{
  const raw=object(input,'Scenario');keys(raw,['version','seed','supply','crews','factors','failureProbability','outage','calendar'],'Scenario');
  if(raw.version!==1)throw new RangeError('Unsupported scenario version.');
  number(raw.seed,0,2147483647,'Seed',true);number(raw.failureProbability,0,0.3,'Inspection failure probability');
  const supply=object(raw.supply,'Supply');keys(supply,['sku','receiptId','delayDays','quantityPercent'],'Supply');
  if(typeof supply.sku!=='string'||!Object.hasOwn(materialCatalog,supply.sku))throw new RangeError('Choose a supported supply SKU.');
  number(supply.delayDays,0,30,'Supply delay (calendar days)',true);number(supply.quantityPercent,0,200,'Supply quantity (%)',true);
  if(typeof supply.receiptId!=='string')throw new RangeError('Choose a receipt.');
  const target=source.materials.receipts.find(r=>r.id===supply.receiptId&&r.lot.sku===supply.sku);
  if(!target&&(supply.receiptId!==''||supply.delayDays!==0||supply.quantityPercent!==100))throw new RangeError('Choose an existing future receipt for this SKU. Opening stock cannot be delayed.');
  const crews=object(raw.crews,'Crew counts'),factors=object(raw.factors,'Task-time factors');
  for(const [shift,pools] of Object.entries(crews)){
    if(!Object.hasOwn(source.resources.crewsByShift,shift))throw new RangeError(`Unsupported crew shift ${shift}.`);
    const values=object(pools,`${shift} crew`);
    for(const [pool,count] of Object.entries(values)){
      if(!Object.hasOwn(source.resources.crewsByShift[shift],pool))throw new RangeError(`Unsupported crew pool ${pool}.`);
      number(count,0,48,`${shift} ${pool} people`,true);
    }
  }
  for(const [station,factor] of Object.entries(factors)){
    if(!(experimentStations as readonly string[]).includes(station))throw new RangeError(`Unsupported station ${station}.`);
    number(factor,0.5,2,`${station} task-time factor`);
  }
  const definition=object(raw.calendar,'Calendar');keys(definition,['timeZone','shifts','excludedDates'],'Calendar');
  if(definition.timeZone!==source.recipe.calendar.timeZone)throw new RangeError('Keep the plant time zone unchanged.');
  if(!Array.isArray(definition.shifts)||definition.shifts.length<1||definition.shifts.length>2)throw new RangeError('Calendar needs one or two named shifts.');
  const labels=new Set<string>();
  for(const item of definition.shifts){const shift=object(item,'Calendar shift');keys(shift,['label','weekdays','startMinute','endMinute','breaks'],'Calendar shift');
    if(typeof shift.label!=='string'||labels.has(shift.label)||!Object.hasOwn(source.resources.crewsByShift,shift.label))throw new RangeError('Use distinct supported shift labels.');labels.add(shift.label);
    if(!Array.isArray(shift.weekdays)||shift.weekdays.length>7||new Set(shift.weekdays).size!==shift.weekdays.length)throw new RangeError('Choose distinct working weekdays.');
    shift.weekdays.forEach(day=>number(day,1,7,'Working weekday',true));
    number(shift.startMinute,0,1439,'Shift start minute',true);number(shift.endMinute,1,1440,'Shift end minute',true);
    if(!Array.isArray(shift.breaks)||shift.breaks.length>4)throw new RangeError('At most four breaks per shift.');
    shift.breaks.forEach(item=>{const pause=object(item,'Shift break');keys(pause,['startMinute','endMinute'],'Shift break');number(pause.startMinute,0,1439,'Break start',true);number(pause.endMinute,1,1440,'Break end',true);});
  }
  const zone=source.recipe.calendar.timeZone,first=dateAt(source.recipe.start,zone).toPlainDate(),last=dateAt(source.recipe.end,zone).toPlainDate();
  if(!Array.isArray(definition.excludedDates)||definition.excludedDates.length>366)throw new RangeError('Calendar needs a bounded list of excluded dates.');
  for(const date of definition.excludedDates){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new RangeError('Excluded dates use YYYY-MM-DD.');
    const value=Temporal.PlainDate.from(date);if(Temporal.PlainDate.compare(value,first)<0||Temporal.PlainDate.compare(value,last)>0)throw new RangeError('Excluded date falls outside this run horizon.');}
  const draft=structuredClone(input) as ScenarioDraft,base=structuredClone(source);
  const calendar=compileCalendar(draft.calendar,first.toString(),last.add({days:1}).toString());
  if(!calendar.working.some(w=>w.start<base.recipe.end&&w.end>base.recipe.start))throw new RangeError('Calendar must provide working time inside this horizon.');
  const oldDates=workingDates(base),newDates=workingDates({...base,recipe:{...base.recipe,calendar}});
  const remap=(instant:number)=>{
    const index=oldDates.findIndex(t=>dateAt(t,zone).toPlainDate().equals(dateAt(instant,zone).toPlainDate()));
    if(index<0||!newDates[index])throw new RangeError('Order releases or receipts exceed the edited calendar horizon.');
    return newDates[index];
  };
  const calendarChanged=JSON.stringify(draft.calendar)!==JSON.stringify(defaultCalendar);
  const orders=base.orders.map(o=>({...o,releaseAt:calendarChanged?remap(o.releaseAt):o.releaseAt}));
  const receipts=base.materials.receipts.map(r=>{const at=calendarChanged?remap(r.at):r.at;
    return {...r,at,...(r.inspectionNotBefore!==undefined?{inspectionNotBefore:r.inspectionNotBefore+at-r.at}:{})};});
  const nominalRecipe={...base.recipe,calendar},nominalMaterials={...base.materials,receipts};
  const materialReceipts=receipts.map(r=>{
    if(r.id!==draft.supply.receiptId)return r;
    const at=dateAt(r.at,zone).add({days:draft.supply.delayDays}).epochMilliseconds;
    if(at<base.recipe.start||at>=base.recipe.end)throw new RangeError('Delayed receipt must remain inside the run horizon.');
    // Inspection cannot finish before arrival; preserve any explicit original hold duration.
    return {...r,at,...(r.inspectionNotBefore!==undefined?{inspectionNotBefore:r.inspectionNotBefore+at-r.at}:{}),
      lot:{...r.lot,quantity:Math.round(r.lot.quantity*draft.supply.quantityPercent/100),quarantined:Math.min(r.lot.quarantined,Math.round(r.lot.quantity*draft.supply.quantityPercent/100))}};
  });
  let outage=null;
  if(draft.outage!==null){const item=object(draft.outage,'Equipment outage');keys(item,['equipmentId','start','end'],'Equipment outage');
    if(typeof item.equipmentId!=='string'||!Object.hasOwn(base.resources.equipment,item.equipmentId))throw new RangeError('Choose a supported equipment resource.');
    if(typeof item.start!=='string'||typeof item.end!=='string')throw new RangeError('Outage needs plant-local start and end dates.');
    const start=localInstant(item.start,zone),end=localInstant(item.end,zone);
    if(start<base.recipe.start||end>base.recipe.end||end<=start)throw new RangeError('Outage must end after its start, within this run horizon.');
    if(base.resources.outages?.some(o=>o.equipmentId===item.equipmentId&&o.start<end&&start<o.end))throw new RangeError('Equipment outages overlap.');
    outage={id:'scenario-outage',equipmentId:item.equipmentId,start,end};
  }
  const resources={...base.resources,crewsByShift:Object.fromEntries(Object.entries(base.resources.crewsByShift).map(([shift,pools])=>[shift,{...pools,...draft.crews[shift]}])),
    outages:[...(base.resources.outages??[]),...(outage?[outage]:[])]};
  const recipe={...nominalRecipe,tasks:base.recipe.tasks.map(task=>{
    if(task.kind==='transfer')return task;
    const durationMs=Math.round(task.durationMs*(draft.factors[task.stationId!]??1));
    return {...task,durationMs,finishWithinDay:task.finishWithinDay&&durationMs<=15*3600000};
  })};
  const daily=new Map<string,number>();for(const interval of calendar.working){const day=dateAt(interval.start,zone).toPlainDate().toString();daily.set(day,(daily.get(day)??0)+interval.end-interval.start);}
  const maxDay=Math.max(...daily.values());
  const impossible=recipe.tasks.find(task=>task.finishWithinDay&&task.durationMs>maxDay);
  if(impossible)throw new RangeError(`${impossible.label} needs ${(impossible.durationMs/3600000).toFixed(1)} working hours in one day; this calendar provides at most ${(maxDay/3600000).toFixed(1)}.`);
  const disruptions={quality:{seed:draft.seed,maxRepairCycles:2,failureProbabilityByTask:Object.fromEntries(recipe.tasks.filter(t=>t.qualityCheck).map(t=>[t.id,draft.failureProbability]))}};
  const identity:ScenarioIdentity={version:'A100-scenario-v1',seed:draft.seed,fingerprint:fingerprint({recipe,orders,materials:{...base.materials,receipts:materialReceipts},resources,disruptions,costRates:base.costRates,wipLimit:base.wipLimit,stationBuffersMs:base.stationBuffersMs,holdStationBuffers:base.holdStationBuffers})};
  return freezeConfiguration({...base,name:`Scenario ${identity.fingerprint} · ${orders.length} orders`,recipe,orders,resources,disruptions,
    materials:{...base.materials,receipts:materialReceipts},scenario:identity,
    ...(base.experiment?{experiment:{...base.experiment,scenario:draft}}:{}),
    scheduleReference:{label:'Frozen nominal schedule · same releases / calendar, before stress',recipe:nominalRecipe,materials:nominalMaterials,resources:base.resources}});
}
export function buildScenario(settings:ExperimentSettings):FleetConfig{
  if(!settings||typeof settings!=='object')throw new RangeError('Provide production settings.');
  if(!settings.stations||Object.keys(settings.stations).some(id=>!(experimentStations as readonly string[]).includes(id)))throw new RangeError('Unsupported station in production settings.');
  object(settings.costs,'Cost assumptions');
  const base=buildExperiment(settings);return applyScenario(base,settings.scenario??defaultScenario(base));
}
