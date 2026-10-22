import {fleetFixture} from './flow.ts';
import type {FleetConfig,FlowEvent} from './flow.ts';
import {workingTimeBetween} from './calendar.ts';
import {defaultStationBufferMs} from './station-buffer.ts';
import {a100CostRates} from './fixtures/a100.ts';
import {validateCostRates} from './costs.ts';
import type {CostRates} from './costs.ts';
import type {ScenarioDraft} from './scenario.ts';

export const experimentStations=['bay-1','bay-2','bay-3','bay-4','bay-5','bay-6','paint','flightline','delivery'] as const;
export type CostAssumptions={wipUnitValue:number;annualHoldingPercent:number;crewHourlyCost:number;deliveryContribution:number};
export type ExperimentSettings={orderCount:number;horizonDays:90|366;releaseEveryWorkdays:number;wipLimit:number;crewScale:number;
  holdBuffers:boolean;stations:Record<string,{bufferHours:number;workScale:number}>;costs:CostAssumptions;costRates?:CostRates;scenario?:ScenarioDraft};
export function defaultSettings():ExperimentSettings{
  return {orderCount:24,horizonDays:90,releaseEveryWorkdays:2,wipLimit:12,crewScale:1,holdBuffers:true,
    stations:Object.fromEntries(experimentStations.map(id=>[id,{bufferHours:0.5,workScale:1}])),
    costs:{wipUnitValue:1_000_000,annualHoldingPercent:20,crewHourlyCost:50,deliveryContribution:500_000},costRates:structuredClone(a100CostRates)};
}
export function settingsForConfig(config:FleetConfig):ExperimentSettings{
  if(config.experiment)return {...structuredClone(config.experiment),costRates:structuredClone(config.costRates??a100CostRates)};
  const defaults=defaultSettings();
  return {...defaults,costRates:structuredClone(config.costRates??a100CostRates),orderCount:config.orders.length,wipLimit:config.wipLimit,
    stations:Object.fromEntries(experimentStations.map(id=>[id,{bufferHours:(config.stationBuffersMs?.[id]??config.stationBufferMs??defaultStationBufferMs)/3600000,workScale:1}]))};
}
function check(label:string,value:number,min:number,max:number,integer=false){
  if(!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw new RangeError(`${label} must be ${integer?'a whole number ':''}between ${min} and ${max}.`);
}
export function buildExperiment(input:ExperimentSettings):FleetConfig{
  const settings=structuredClone(input);
  validateCostRates(settings.costRates??a100CostRates);
  check('Orders',settings.orderCount,1,60,true);check('Release spacing',settings.releaseEveryWorkdays,1,20,true);
  check('WIP limit',settings.wipLimit,1,20,true);check('Staffing multiplier',settings.crewScale,0.25,2);
  if(![90,366].includes(settings.horizonDays))throw new RangeError('Choose a 90 or 366 day horizon.');
  if(typeof settings.holdBuffers!=='boolean')throw new RangeError('Select a station buffer policy.');
  for(const id of experimentStations){const station=settings.stations[id];
    if(!station)throw new RangeError(`Missing station ${id}.`);
    check(`${id} buffer hours`,station.bufferHours,0,450);check(`${id} work multiplier`,station.workScale,0.25,20);
  }
  for(const key of ['wipUnitValue','annualHoldingPercent','crewHourlyCost','deliveryContribution'] as const)check(`Cost assumption ${key}`,settings.costs[key],0,key==='annualHoldingPercent'?100:1e12);
  const base=fleetFixture('baseline',1,settings.horizonDays),calendar=base.recipe.calendar;
  const dates=calendar.shifts.filter(shift=>shift.label===calendar.shifts[0].label&&shift.start>=base.recipe.start&&shift.start<base.recipe.end).map(shift=>shift.start);
  if((settings.orderCount-1)*settings.releaseEveryWorkdays>=dates.length)throw new RangeError('These order releases exceed the selected horizon. Reduce orders or release spacing, or use 366 days.');
  const orders=Array.from({length:settings.orderCount},(_,i)=>({serialId:`A100-${String(i+1).padStart(3,'0')}`,releaseAt:dates[i*settings.releaseEveryWorkdays]}));
  const receipts=orders.flatMap((order,i)=>i>0&&i%4===0?base.materials.initial.map(lot=>({id:`receipt-${i}-${lot.sku}`,at:order.releaseAt,
    lot:{...lot,id:`batch-${i}-${lot.sku}`,location:'Central stores',quarantined:0}})):[]);
  return {...base,name:`Custom experiment · ${settings.orderCount} orders`,costRates:structuredClone(settings.costRates??a100CostRates),experiment:settings,orders,wipLimit:settings.wipLimit,
    holdStationBuffers:settings.holdBuffers,stationBuffersMs:Object.fromEntries(experimentStations.map(id=>[id,Math.round(settings.stations[id].bufferHours*3600000)])),
    recipe:{...base.recipe,tasks:base.recipe.tasks.map(task=>{if(task.kind==='transfer')return task;
      const durationMs=Math.round(task.durationMs*settings.stations[task.stationId!].workScale);
      return {...task,durationMs,finishWithinDay:task.finishWithinDay&&durationMs<=15*3600000};})},
    materials:{initial:base.materials.initial,receipts},resources:{...base.resources,
      crewsByShift:Object.fromEntries(Object.entries(base.resources.crewsByShift).map(([shift,pools])=>[shift,
        Object.fromEntries(Object.entries(pools).map(([pool,count])=>[pool,Math.round(count*settings.crewScale)]))]))}};
}

/** Uses the complete event ledger, never the truncated aircraft inspector history. USD assumptions are synthetic. */
export function runEconomics(config:FleetConfig,events:readonly FlowEvent[],until:number,costs:CostAssumptions){
  const now=Math.max(config.recipe.start,Math.min(until,config.recipe.end)),calendar=config.recipe.calendar;
  let at=config.recipe.start,wip=0,peakWip=0,delivered=0,wipMs=0,crew=0,usedCrewMs=0;
  const accrue=(to:number)=>{wipMs+=wip*(to-at);if(crew)usedCrewMs+=crew*workingTimeBetween(calendar,at,to);at=to;};
  for(const event of events){if(event.instant>now)break;if(event.instant<config.recipe.start)continue;accrue(event.instant);
    if(event.kind==='admitted'){wip++;peakWip=Math.max(peakWip,wip);}
    if(event.kind==='delivered'){wip--;delivered++;}
    if(event.resource)crew+=(event.kind==='resource-allocated'?1:-1)*event.resource.crews.length;
  }
  accrue(now);
  const staffedCrewHours=calendar.shifts.reduce((total,shift)=>{
    const start=Math.max(config.recipe.start,shift.start),end=Math.min(now,shift.end);
    return total+(end>start?workingTimeBetween(calendar,start,end)*Object.values(config.resources.crewsByShift[shift.label]??{}).reduce((n,count)=>n+count,0)/3600000:0);
  },0);
  const wipDays=wipMs/86400000,usedCrewHours=usedCrewMs/3600000,idleCrewHours=Math.max(0,staffedCrewHours-usedCrewHours);
  const holdingCost=wipDays*costs.wipUnitValue*costs.annualHoldingPercent/100/365,laborCost=staffedCrewHours*costs.crewHourlyCost;
  return {until:now,elapsedDays:(now-config.recipe.start)/86400000,delivered,peakWip,wipDays,averageWip:now>config.recipe.start?wipMs/(now-config.recipe.start):0,
    staffedCrewHours,usedCrewHours,idleCrewHours,holdingCost,laborCost,idleLaborCost:idleCrewHours*costs.crewHourlyCost,
    deliveryContribution:delivered*costs.deliveryContribution,netContribution:delivered*costs.deliveryContribution-holdingCost-laborCost};
}
