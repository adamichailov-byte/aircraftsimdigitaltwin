import {Temporal} from '@js-temporal/polyfill';
import type {FleetConfig,FlowEvent} from './flow.ts';
import {workingTimeBetween} from './calendar.ts';
import {a100CostRates} from './fixtures/a100.ts';

export type CostRates={version:string;laborPerHourCents:number;overtimePremiumPerHourCents:number;
  carryingPerDayCents:number;latenessPerDayCents:number;materialUnitCents:Readonly<Record<string,number>>;overtimeShiftLabels:readonly string[]};
export const costCategories=['labor','overtime','materials','carrying','lateness'] as const;
export type CostCategory=typeof costCategories[number];
export type CostRow={id:string;category:CostCategory;serialId?:string;taskId?:string;sku?:string;label:string;
  from:number;to:number;quantity:number;unit:'person-hours'|'units'|'aircraft-days';rateCents:number;
  amountCents:number;unfinished:boolean;eventIds:readonly string[];source:string};
export function validateCostRates(rates:CostRates){
  if(!rates.version||!Array.isArray(rates.overtimeShiftLabels)||rates.overtimeShiftLabels.some(s=>typeof s!=='string'))throw new RangeError('Invalid cost rate version or overtime shifts.');
  for(const n of [rates.laborPerHourCents,rates.overtimePremiumPerHourCents,rates.carryingPerDayCents,rates.latenessPerDayCents,...Object.values(rates.materialUnitCents)])
    if(!Number.isSafeInteger(n)||n<0||n>1e9)throw new RangeError('Cost rates must be nonnegative integer cents, at most $10,000,000 per unit, hour or day, to keep this bounded scenario ledger safe.');
}
/** Exact half-up cents at stable postings, never per frame. */
function charge(rate:number,quantityMs:number,unitMs:number){
  const numerator=BigInt(rate)*BigInt(quantityMs),denominator=BigInt(unitMs);
  const cents=Number((numerator+denominator/2n)/denominator);
  if(!Number.isSafeInteger(cents))throw new RangeError('Cost posting exceeds safe integer cents.');
  return cents;
}
export function orderDueAt(config:FleetConfig,order:FleetConfig['orders'][number]){
  return order.dueAt??Temporal.Instant.fromEpochMilliseconds(order.releaseAt).toZonedDateTimeISO(config.recipe.calendar.timeZone).add({days:35}).epochMilliseconds;
}
/** Pure projection. Rounded cumulative endpoints make adjacent report ranges reconcile. */
export function costLedger({config,events,cutoff,from=config.recipe.start,to=config.recipe.end+1,runId}:{
  config:FleetConfig;events:readonly FlowEvent[];cutoff:number;from?:number;to?:number;runId?:string}){
  const rates=config.costRates??a100CostRates;validateCostRates(rates);
  const start=Math.max(config.recipe.start,Math.min(from,cutoff,config.recipe.end));
  const end=Math.max(start,Math.min(to,cutoff,config.recipe.end)),calendar=config.recipe.calendar;
  const rows:CostRow[]=[],seen=new Set<string>();
  const visible=events.filter(e=>(!runId||e.runId===runId)&&e.instant>=config.recipe.start&&e.instant<=end&&e.instant<to&&!seen.has(e.id)&&seen.add(e.id))
    .slice().sort((a,b)=>a.instant-b.instant||a.sequence-b.sequence);
  const admissions=new Map<string,FlowEvent>(),deliveries=new Map<string,FlowEvent>();
  for(const e of visible){if(e.kind==='admitted'&&!admissions.has(e.serialId))admissions.set(e.serialId,e);
    if(e.kind==='delivered'&&!deliveries.has(e.serialId))deliveries.set(e.serialId,e);}
  const durationRow=(row:Omit<CostRow,'quantity'|'amountCents'|'from'|'to'>,origin:number,finish:number,unitMs:number,count=1,working=false)=>{
    const a=Math.max(start,origin),b=Math.min(end,finish);if(b<=a)return;
    const elapsed=(until:number)=>count*(working?workingTimeBetween(calendar,origin,until):until-origin);
    const quantityMs=elapsed(b)-elapsed(a);if(!quantityMs)return;
    rows.push({...row,from:a,to:b,quantity:quantityMs/unitMs,amountCents:charge(row.rateCents,elapsed(b),unitMs)-charge(row.rateCents,elapsed(a),unitMs)});
  };
  for(const shift of calendar.shifts){
    const crew=Object.values(config.resources.crewsByShift[shift.label]??{}).reduce((n,c)=>n+c,0);
    const source=`resources.crewsByShift[${shift.label}] × calendar.working (breaks excluded)`;
    const row={id:`labor/${shift.start}`,category:'labor' as const,label:`${shift.label} · ${crew} scheduled people`,unit:'person-hours' as const,
      rateCents:rates.laborPerHourCents,unfinished:false,eventIds:[],source};
    durationRow(row,Math.max(config.recipe.start,shift.start),shift.end,3600000,crew,true);
    if(rates.overtimeShiftLabels.includes(shift.label))durationRow({...row,id:`overtime/${shift.start}`,category:'overtime',label:`${shift.label} · premium above base`,rateCents:rates.overtimePremiumPerHourCents},Math.max(config.recipe.start,shift.start),shift.end,3600000,crew,true);
  }
  const issues=new Set<string>();
  for(const e of visible)if(e.kind==='material-issued'&&e.material&&!issues.has(e.material.id)){
    issues.add(e.material.id);if(e.instant<start)continue;
    const quantities=new Map<string,number>();for(const a of e.material.allocations)quantities.set(a.sku,(quantities.get(a.sku)??0)+a.quantity);
    for(const [sku,quantity] of quantities){const rate=rates.materialUnitCents[sku];if(rate===undefined)throw new RangeError(`Missing cost rate for ${sku}.`);
      rows.push({id:`materials/${e.id}/${sku}`,category:'materials',serialId:e.serialId,taskId:e.taskId,sku,label:`${sku} · ${e.taskId??'material issue'}`,
        from:e.instant,to:e.instant,quantity,unit:'units',rateCents:rate,amountCents:charge(rate,quantity,1),unfinished:!deliveries.has(e.serialId),eventIds:[e.id],source:`material-issued ${e.material.id} · FIFO lot allocations`});
    }
  }
  for(const [serialId,admission] of admissions){const delivered=deliveries.get(serialId);
    durationRow({id:`carrying/${serialId}`,category:'carrying',serialId,label:delivered?'WIP residence · delivered':'WIP residence · unfinished',unit:'aircraft-days',rateCents:rates.carryingPerDayCents,unfinished:!delivered,
      eventIds:[admission.id,...(delivered?[delivered.id]:[])],source:'Actual admission → delivery or observed cutoff'},admission.instant,delivered?.instant??end,86400000);
  }
  for(const order of config.orders){const due=orderDueAt(config,order),delivered=deliveries.get(order.serialId);
    durationRow({id:`lateness/${order.serialId}`,category:'lateness',serialId:order.serialId,label:delivered?'Accrued lateness · delivered':admissions.has(order.serialId)?'Accrued lateness · unfinished WIP':'Accrued lateness · upstream',unit:'aircraft-days',rateCents:rates.latenessPerDayCents,unfinished:!delivered,
      eventIds:delivered?[delivered.id]:[],source:`orders[${order.serialId}].dueAt ${order.dueAt===undefined?'(release + 35 local calendar days)':'(explicit)'} → delivery or observed cutoff`},due,delivered?.instant??end,86400000);
  }
  // Busy labor explains paid capacity; it is never another charged cost category.
  const active=new Map<string,FlowEvent>();let productivePersonMs=0;
  const finish=(e:FlowEvent,until:number)=>{const a=Math.max(start,e.instant),b=Math.min(end,until);
    if(b>a)productivePersonMs+=(e.resource?.crews.length??0)*workingTimeBetween(calendar,a,b);};
  for(const e of visible)if(e.resource){const key=`${e.serialId}/${e.taskId??e.resource.taskId}`;
    if(e.kind==='resource-allocated'&&!active.has(key))active.set(key,e);
    else if(e.kind==='resource-released'){const allocated=active.get(key);if(allocated){finish(allocated,e.instant);active.delete(key);}}}
  for(const e of active.values())finish(e,end);
  const totals=Object.fromEntries(costCategories.map(category=>[category,rows.filter(r=>r.category===category).reduce((n,r)=>n+r.amountCents,0)])) as Record<CostCategory,number>;
  const totalCents=Object.values(totals).reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(totalCents))throw new RangeError('Cost total exceeds safe integer cents.');
  const productiveLaborCents=Math.min(totals.labor,charge(rates.laborPerHourCents,productivePersonMs,3600000));
  return{from:start,to:end,rates,rows,totals,totalCents,productivePersonHours:productivePersonMs/3600000,productiveLaborCents,idleLaborCents:totals.labor-productiveLaborCents,
    unfinishedLatenessCents:rows.filter(r=>r.category==='lateness'&&r.unfinished).reduce((n,r)=>n+r.amountCents,0),
    unfinishedCarryingCents:rows.filter(r=>r.category==='carrying'&&r.unfinished).reduce((n,r)=>n+r.amountCents,0)};
}
export type CostLedger=ReturnType<typeof costLedger>;
