import {Temporal} from '@js-temporal/polyfill';
import type {FleetConfig,FleetSnapshot,FlowEvent} from './flow.ts';
import {workingTimeBetween} from './calendar.ts';
import {residenceKinds,stationResidence} from './report-intervals.ts';
import type {ResidenceKind} from './report-intervals.ts';

export type Contribution={serialId:string;at:number;label:string;eventIds:string[];durationMs?:number;quantity?:number;to?:number};
export const localReportDate=(instant:number,timeZone:string)=>Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(timeZone).toPlainDate().toString();
export const reportDateInstant=(date:string,timeZone:string,next=false)=>Temporal.PlainDate.from(date).add({days:next?1:0}).toZonedDateTime(timeZone).epochMilliseconds;

/** Report periods are [from,to); the current observed cutoff itself is included. */
export function productionReport({config,fleet,events,from,to,cutoff}:{config:FleetConfig;fleet:FleetSnapshot;events:readonly FlowEvent[];from:number;to:number;cutoff:number}){
  const start=Math.max(config.recipe.start,Math.min(from,cutoff)),end=Math.max(start,Math.min(to,cutoff,config.recipe.end));
  const beforeEnd=(instant:number)=>instant<to&&instant<=cutoff&&instant<=config.recipe.end;
  const seen=new Set<string>();
  const visible=events.filter(e=>e.runId===fleet.runId&&beforeEnd(e.instant)&&!seen.has(e.id)&&seen.add(e.id)).slice().sort((a,b)=>a.instant-b.instant||a.sequence-b.sequence);
  const admissionsById=new Map<string,FlowEvent>(),departuresById=new Map<string,FlowEvent>();
  for(const event of visible){if(event.kind==='admitted'&&!admissionsById.has(event.serialId))admissionsById.set(event.serialId,event);
    if(event.kind==='delivered'&&!departuresById.has(event.serialId))departuresById.set(event.serialId,event);}
  const contribution=(event:FlowEvent):Contribution=>({serialId:event.serialId,at:event.instant,label:event.label,eventIds:[event.id]});
  const deliveries=[...departuresById.values()].filter(e=>e.instant>=start).map(e=>({...contribution(e),
    durationMs:admissionsById.has(e.serialId)?e.instant-admissionsById.get(e.serialId)!.instant:undefined}));
  const admissions=[...admissionsById.values()].filter(e=>e.instant>=start).map(contribution);
  const openingWip=[...admissionsById.values()].filter(e=>e.instant<start&&(!departuresById.has(e.serialId)||departuresById.get(e.serialId)!.instant>=start)).map(contribution);
  const endingWip=[...admissionsById.values()].filter(e=>!departuresById.has(e.serialId)).map(e=>({...contribution(e),label:'Unfinished · age since admission',durationMs:end-e.instant}));
  const releases=config.orders.filter(o=>o.releaseAt>=start&&beforeEnd(o.releaseAt)).map(o=>({serialId:o.serialId,at:o.releaseAt,label:'Scheduled order release',eventIds:[]}));
  const backlog=config.orders.filter(o=>beforeEnd(o.releaseAt)&&!admissionsById.has(o.serialId)).map(o=>({serialId:o.serialId,at:o.releaseAt,label:'Released order awaiting admission',eventIds:[]}));
  const completed=deliveries.filter(e=>e.durationMs!==undefined);
  const flowTimeMs=completed.length?completed.reduce((n,e)=>n+e.durationMs!,0)/completed.length:null;
  const timeZone=config.recipe.calendar.timeZone;
  const months:{key:string;from:number;to:number;partial:boolean;deliveries:Contribution[]}[]=[];
  let month=Temporal.Instant.fromEpochMilliseconds(start).toZonedDateTimeISO(timeZone).toPlainDate().with({day:1});
  while(month.toZonedDateTime(timeZone).epochMilliseconds<=end&&month.toZonedDateTime(timeZone).epochMilliseconds<to){
    const begin=month.toZonedDateTime(timeZone).epochMilliseconds,next=month.add({months:1}),finish=next.toZonedDateTime(timeZone).epochMilliseconds;
    months.push({key:month.toString().slice(0,7),from:Math.max(start,begin),to:Math.min(end,finish),partial:start>begin||end<finish,
      deliveries:deliveries.filter(e=>e.at>=begin&&e.at<finish)});month=next;
  }
  const openingSerials=new Set(openingWip.map(e=>e.serialId));
  const partsBySku=new Map<string,{sku:string;issued:number;openingWipIssued:number;issuedToOpeningWip:number;cumulativeIssued:number;issues:Contribution[];openingIssues:Contribution[]}>();
  const part=(sku:string)=>{let row=partsBySku.get(sku);if(!row){row={sku,issued:0,openingWipIssued:0,issuedToOpeningWip:0,cumulativeIssued:0,issues:[],openingIssues:[]};partsBySku.set(sku,row);}return row;};
  for(const lot of [...config.materials.initial,...config.materials.receipts.map(r=>r.lot)])part(lot.sku);
  for(const event of visible)if(event.kind==='material-issued'&&event.material){
    const quantities=new Map<string,number>();for(const a of event.material.allocations)quantities.set(a.sku,(quantities.get(a.sku)??0)+a.quantity);
    for(const [sku,n] of quantities){const row=part(sku),e={...contribution(event),label:`${event.taskId??event.material.taskId} · ${sku}`,quantity:n};row.cumulativeIssued+=n;
      if(event.instant>=start){row.issued+=n;row.issues.push(e);if(openingSerials.has(event.serialId))row.issuedToOpeningWip+=n;}
      else if(openingSerials.has(event.serialId)){row.openingWipIssued+=n;row.openingIssues.push(e);}
    }
  }
  const intervals=stationResidence(config,fleet,visible,start,end);
  const stationIds=[...new Set([...config.recipe.tasks.map(t=>t.stationId!).filter(Boolean),...intervals.map(i=>i.station)])];
  const stations=stationIds.map(id=>{
    const rows=intervals.filter(i=>i.station===id),tasks=config.recipe.tasks.filter(t=>t.stationId===(id==='delivery-2'?'delivery':id)&&t.kind!=='transfer'&&t.durationMode!=='elapsed');
    const availableMs=config.recipe.calendar.shifts.reduce((sum,shift)=>{
      const staffed=tasks.some(task=>Object.entries(task.crewRequirements).every(([pool,n])=>(config.resources.crewsByShift[shift.label]?.[pool]??0)>=n)
        &&Object.entries(task.equipmentRequirements??{}).every(([pool,n])=>(config.resources.equipment[pool]??0)>=n));
      const a=Math.max(start,shift.start),b=Math.min(end,shift.end);return sum+(staffed&&b>a?workingTimeBetween(config.recipe.calendar,a,b):0);
    },0);
    const breakdown=Object.fromEntries(residenceKinds.map(kind=>[kind,rows.filter(r=>r.kind===kind).reduce((sum,r)=>sum+r.to-r.from,0)])) as Record<ResidenceKind,number>;
    const occupiedMs=rows.reduce((sum,r)=>sum+r.to-r.from,0),productiveMs=breakdown.productive,materialMs=breakdown.material;
    return{id,occupiedMs,productiveMs,materialMs,availableMs,utilization:availableMs?productiveMs/availableMs:null,breakdown,intervals:rows};
  });
  return{from:start,to:end,cutoff,timeZone,months,releases,backlog,admissions,openingWip,endingWip,deliveries,flowTimeMs,flowTimeCount:completed.length,
    parts:[...partsBySku.values()].sort((a,b)=>a.sku.localeCompare(b.sku)),stations,intervals,events:visible};
}
export type ProductionReport=ReturnType<typeof productionReport>;
