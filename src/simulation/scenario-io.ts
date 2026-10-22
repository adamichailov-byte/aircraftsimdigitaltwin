import {buildScenario} from './scenario.ts';
import {settingsForConfig,experimentStations} from './experiments.ts';
import type {ExperimentSettings} from './experiments.ts';
import type {FleetConfig} from './flow.ts';
import {assumptionVersion,modelVersion,runSummary} from './compare.ts';
import type {RecordedRun} from './compare.ts';
import {materialCatalog} from './fixtures/a100.ts';

export const maxScenarioBytes=1_000_000;
function keys(value:unknown,allowed:readonly string[],label:string):asserts value is Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new RangeError(`${label} has unsupported fields or is not an object.`);
}
export function exportScenario(config:FleetConfig){
  if(!config.experiment||!config.scenario)throw new RangeError('Only scenarios created by Simulation settings can be saved.');
  return JSON.stringify({schemaVersion:1,modelVersion,assumptionVersion,scenarioVersion:config.scenario.version,costVersion:config.costRates!.version,settings:settingsForConfig(config)},null,2);
}
/** Data only. Validate fully before the caller replaces any active run. */
export function importScenario(text:string):FleetConfig{
  if(new TextEncoder().encode(text).byteLength>maxScenarioBytes)throw new RangeError('Scenario exceeds the 1 MB limit.');
  let count=0;
  const raw:unknown=JSON.parse(text);
  const inspect=(v:unknown,depth=0)=>{
    if(++count>20000||depth>16)throw new RangeError('Scenario structure is too large or deeply nested.');
    if(typeof v==='string'&&(v.length>256||v!=='America/New_York'&&/https?:|file:|javascript:|[\\/]/i.test(v)))throw new RangeError('Scenario strings cannot contain URLs, paths or code.');
    if(v&&typeof v==='object')for(const [key,item] of Object.entries(v)){
      if(['__proto__','prototype','constructor'].includes(key))throw new RangeError('Unsafe scenario property.');inspect(item,depth+1);
    }
  };inspect(raw);
  keys(raw,['schemaVersion','modelVersion','assumptionVersion','scenarioVersion','costVersion','settings'],'Scenario file');
  if(raw.schemaVersion!==1||raw.modelVersion!==modelVersion||raw.assumptionVersion!==assumptionVersion||raw.scenarioVersion!=='A100-scenario-v1'||raw.costVersion!=='A100-costs-v1')throw new RangeError('Unrecognized schema, model or assumption version. No migration is available.');
  const s=raw.settings;keys(s,['orderCount','horizonDays','releaseEveryWorkdays','wipLimit','crewScale','holdBuffers','stations','costs','costRates','scenario'],'Settings');
  keys(s.stations,experimentStations,'Stations');for(const v of Object.values(s.stations))keys(v,['bufferHours','workScale'],'Station');
  keys(s.costs,['wipUnitValue','annualHoldingPercent','crewHourlyCost','deliveryContribution'],'Legacy cost assumptions');
  keys(s.costRates,['version','laborPerHourCents','overtimePremiumPerHourCents','carryingPerDayCents','latenessPerDayCents','materialUnitCents','overtimeShiftLabels'],'Cost rates');
  if(s.costRates.version!==raw.costVersion)throw new RangeError('Cost assumption versions disagree.');
  keys(s.costRates.materialUnitCents,Object.keys(materialCatalog),'Material rates');
  const materialRates=s.costRates.materialUnitCents;
  if(Object.keys(materialCatalog).some(k=>!Object.hasOwn(materialRates,k)))throw new RangeError('Missing material cost rate.');
  if(!Array.isArray(s.costRates.overtimeShiftLabels)||s.costRates.overtimeShiftLabels.length>2||s.costRates.overtimeShiftLabels.some(v=>!['Shift 1','Shift 2'].includes(v)))throw new RangeError('Unsupported overtime shifts.');
  if(!s.scenario)throw new RangeError('Missing scenario inputs and seed.');
  return buildScenario(s as unknown as ExperimentSettings);
}
const cell=(value:unknown)=>`"${String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
const csv=(rows:unknown[][])=>rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
export function resultsCsv(run:RecordedRun){
  const s=runSummary(run),rows:unknown[][]=[['record','key','serial','month','quantity','unit','model','assumptions','seed','configuration']];
  const add=(type:string,key:string,serial:string,month:string,n:number,unit:string)=>rows.push([type,key,serial,month,n,unit,run.modelVersion,run.assumptionVersion,run.config.scenario?.seed,run.config.scenario?.fingerprint]);
  for(const m of s.months){add('month','delivered','',m.month,m.deliveries,'aircraft');add('month','ending-wip','',m.month,m.wip,'aircraft');for(const [key,n] of Object.entries(m.costs))add('month-cost',key,'',m.month,n,'USD cents');}
  for(const [sku,n] of Object.entries(s.materials))add('material-issued',sku,'','',n,'units');
  for(const a of run.fleet.aircraft)add('aircraft',a.state,a.id,'',1,'aircraft');
  for(const [key,n] of Object.entries(s.costs.totals))add('total-cost',key,'','',n,'USD cents');
  add('unfinished-exposure','carrying','','',s.costs.unfinishedCarryingCents,'USD cents');add('unfinished-exposure','lateness','','',s.costs.unfinishedLatenessCents,'USD cents');
  return csv(rows);
}
export function eventsCsv(run:RecordedRun){
  const rows:unknown[][]=[['sequence','instant-UTC','serial','kind','task','sku','quantity','label','model','assumptions','seed']];
  for(const e of run.events){const items=e.kind==='material-issued'?e.material?.allocations:undefined;
    for(const a of items?.length?items:[null])rows.push([e.sequence,new Date(e.instant).toISOString(),e.serialId,e.kind,e.taskId,a?.sku,a?.quantity,e.label,run.modelVersion,run.assumptionVersion,run.config.scenario?.seed]);}
  return csv(rows);
}
