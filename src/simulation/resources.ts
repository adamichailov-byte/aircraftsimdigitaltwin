import {calendarStateAt} from './calendar.ts';
import type {PlantCalendar} from './types.ts';
import type {TaskDefinition} from './tasks.ts';
import type {EquipmentOutage} from './disruptions.ts';

export type ResourcePlan={crewsByShift:Readonly<Record<string,Readonly<Record<string,number>>>>;
  equipment:Readonly<Record<string,number>>;outages?:readonly EquipmentOutage[]};
export type ResourceUnit={pool:string;unit:number};
export type ResourceAllocation={serialId:string;taskId:string;shift:string|null;crews:readonly ResourceUnit[];
  equipment:readonly ResourceUnit[];acquiredAt:number;eventId:string};
export type ResourceSnapshot={shift:string|null;crews:readonly {pool:string;capacity:number;used:number;available:number}[];
  equipment:readonly {pool:string;capacity:number;used:number;available:number}[];allocations:readonly ResourceAllocation[];
  outages:readonly (EquipmentOutage&{state:'scheduled'|'active'|'recovered'})[]};
export type ResourcePosting={id:string;kind:'resource-allocated'|'resource-released';instant:number;serialId:string;taskId:string;
  shift:string|null;crews:readonly ResourceUnit[];equipment:readonly ResourceUnit[];causeEventIds:readonly string[]};
export type OutageTransition={id:string;equipmentId:string;edge:'start'|'end'};
type Posting=ResourcePosting;

function validatePools(pools:Readonly<Record<string,number>>,label:string){
  for(const [id,count] of Object.entries(pools))if(!id||!Number.isSafeInteger(count)||count<0||count>48)
    throw new RangeError(`Invalid ${label} capacity for ${id}.`);
}

/** Atomic fixed-unit crew and equipment leases shared by every aircraft in one run. */
export class ResourceManager{
  readonly plan:ResourcePlan;
  private readonly calendar:PlantCalendar;
  private readonly allocations=new Map<string,ResourceAllocation>();
  private readonly history:Posting[]=[];
  private readonly emit:(posting:Posting)=>string;
  private readonly outages:readonly EquipmentOutage[];
  constructor(plan:ResourcePlan,calendar:PlantCalendar,emit:(posting:Posting)=>string=posting=>posting.id){
    if(!Object.keys(plan.crewsByShift).length)throw new RangeError('At least one staffed shift is required.');
    for(const [shift,pools] of Object.entries(plan.crewsByShift)){if(!shift)throw new RangeError('Shift names cannot be empty.');validatePools(pools,`${shift} crew`);}
    validatePools(plan.equipment,'Equipment');
    const outages=[...(plan.outages??[])].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
    const outageIds=new Set<string>();
    for(const outage of outages){
      if(!outage.id||outageIds.has(outage.id)||!Object.hasOwn(plan.equipment,outage.equipmentId)
        ||!Number.isSafeInteger(outage.start)||!Number.isSafeInteger(outage.end)||outage.start<calendar.start
        ||outage.end>calendar.end||outage.end<=outage.start)throw new RangeError(`Invalid equipment outage ${outage.id||'(unnamed)'}.`);
      outageIds.add(outage.id);
    }
    for(let i=0;i<outages.length;i++)for(let j=i+1;j<outages.length;j++)
      if(outages[i].equipmentId===outages[j].equipmentId&&outages[i].start<outages[j].end&&outages[j].start<outages[i].end)
        throw new RangeError(`Overlapping equipment outages for ${outages[i].equipmentId}.`);
    this.plan=Object.freeze({crewsByShift:Object.freeze(Object.fromEntries(Object.entries(plan.crewsByShift)
      .map(([shift,pools])=>[shift,Object.freeze({...pools})]))),equipment:Object.freeze({...plan.equipment}),
      outages:Object.freeze(outages.map(outage=>Object.freeze({...outage})))});
    this.outages=this.plan.outages!;
    this.calendar=calendar;this.emit=emit;
  }
  private key(serialId:string,taskId:string){return `${serialId}/${taskId}`;}
  private currentShift(instant:number){const state=calendarStateAt(this.calendar,instant);return state.status==='working'?state.shift:null;}
  private used(kind:'crews'|'equipment',pool:string,shift:string|null){
    return [...this.allocations.values()].reduce((sum,a)=>sum+(kind==='equipment'?a.equipment:a.crews)
      .filter(unit=>unit.pool===pool&&(kind==='equipment'||a.shift===shift)).length,0);
  }
  blockers(task:TaskDefinition,instant:number):string[]{
    const shift=this.currentShift(instant),crews=this.plan.crewsByShift[shift??'']??{},reasons:string[]=[];
    for(const [pool,need] of Object.entries(task.crewRequirements)){
      const available=Math.max(0,(crews[pool]??0)-this.used('crews',pool,shift));
      if(available<need)reasons.push(`Waiting for ${pool} crew · need ${need}, available ${available}`);
    }
    for(const [pool,need] of Object.entries(task.equipmentRequirements??{})){
      const outage=this.outages.find(item=>item.equipmentId===pool&&item.start<=instant&&instant<item.end);
      if(outage){reasons.push(`Waiting for ${pool.replaceAll('-',' ')} outage recovery · ${new Date(outage.end).toISOString()}`);continue;}
      const available=Math.max(0,(this.plan.equipment[pool]??0)-this.used('equipment',pool,shift));
      if(available<need)reasons.push(`Waiting for ${pool} equipment · need ${need}, available ${available}`);
    }
    return reasons;
  }
  outageBlockers(task:TaskDefinition,instant:number){
    return Object.entries(task.equipmentRequirements??{}).flatMap(([pool])=>{
      const outage=this.outages.find(item=>item.equipmentId===pool&&item.start<=instant&&instant<item.end);
      return outage?[`Waiting for ${pool.replaceAll('-',' ')} outage recovery · ${new Date(outage.end).toISOString()}`]:[];
    });
  }
  nextOutageBoundary(after:number){
    return this.outages.flatMap(outage=>[outage.start,outage.end]).filter(instant=>instant>after).sort((a,b)=>a-b)[0]??null;
  }
  outageTransitions(instant:number):readonly OutageTransition[]{
    return this.outages.flatMap(outage=>[
      ...(outage.start===instant?[{id:outage.id,equipmentId:outage.equipmentId,edge:'start' as const}]:[]),
      ...(outage.end===instant?[{id:outage.id,equipmentId:outage.equipmentId,edge:'end' as const}]:[]),
    ]);
  }
  canEverAcquire(task:TaskDefinition){
    const crewNeeds=Object.entries(task.crewRequirements);
    const crewOk=crewNeeds.length===0||Object.values(this.plan.crewsByShift).some(pools=>
      crewNeeds.every(([pool,need])=>(pools[pool]??0)>=need));
    const equipmentOk=Object.entries(task.equipmentRequirements??{}).every(([pool,need])=>(this.plan.equipment[pool]??0)>=need);
    return crewOk&&equipmentOk;
  }
  acquire(task:TaskDefinition,serialId:string,instant:number):string|null{
    if(!Object.keys(task.crewRequirements).length&&!Object.keys(task.equipmentRequirements??{}).length)return null;
    const key=this.key(serialId,task.id),existing=this.allocations.get(key);if(existing)return existing.eventId;
    if(this.blockers(task,instant).length)return null;
    const shift=this.currentShift(instant),crewPool=this.plan.crewsByShift[shift??'']??{};
    const take=(kind:'crews'|'equipment',pool:string,count:number,capacity:number):ResourceUnit[]=>{
      const inUse=new Set([...this.allocations.values()].flatMap(a=>(kind==='equipment'?a.equipment:a.crews)
        .filter(unit=>unit.pool===pool&&(kind==='equipment'||a.shift===shift)).map(unit=>unit.unit)));
      const result:ResourceUnit[]=[];for(let unit=1;unit<=capacity&&result.length<count;unit++)if(!inUse.has(unit))result.push({pool,unit});return result;
    };
    const crews=Object.entries(task.crewRequirements).flatMap(([pool,count])=>take('crews',pool,count,crewPool[pool]??0));
    const equipment=Object.entries(task.equipmentRequirements??{}).flatMap(([pool,count])=>take('equipment',pool,count,this.plan.equipment[pool]??0));
    const allocation={serialId,taskId:task.id,shift,crews,equipment,acquiredAt:instant,eventId:''} as ResourceAllocation;
    allocation.eventId=this.post('resource-allocated',allocation,instant,[]);
    this.allocations.set(key,Object.freeze({...allocation,crews:Object.freeze(crews.map(unit=>Object.freeze(unit))),
      equipment:Object.freeze(equipment.map(unit=>Object.freeze(unit)))}));
    return allocation.eventId;
  }
  release(task:TaskDefinition,serialId:string,instant:number,keepEquipment=false,causeEventIds:readonly string[]=[]):string[]{
    const key=this.key(serialId,task.id),allocation=this.allocations.get(key);if(!allocation)return [];
    const crews=allocation.crews,equipment=keepEquipment?[]:allocation.equipment;
    if(!crews.length&&!equipment.length){if(!keepEquipment)this.allocations.delete(key);return [];}
    const remaining=Object.freeze({...allocation,crews:Object.freeze([]),equipment:Object.freeze(keepEquipment?[...allocation.equipment]:[])});
    if(keepEquipment)this.allocations.set(key,remaining);else this.allocations.delete(key);
    const priorCauses=causeEventIds.filter(id=>this.history.some(event=>event.id===id));
    if(this.history.some(event=>event.id===allocation.eventId))priorCauses.push(allocation.eventId);
    return [this.post('resource-released',{...allocation,crews,equipment},instant,[...new Set(priorCauses)])];
  }
  releaseAll(task:TaskDefinition,serialId:string,instant:number,causeEventIds:readonly string[]=[]){return this.release(task,serialId,instant,false,causeEventIds);}
  private post(kind:Posting['kind'],allocation:ResourceAllocation,instant:number,causeEventIds:readonly string[]){
    const posting:Posting={id:`resource-${this.history.length+1}`,kind,instant,serialId:allocation.serialId,taskId:allocation.taskId,
      shift:allocation.shift,crews:allocation.crews.map(unit=>({...unit})),equipment:allocation.equipment.map(unit=>({...unit})),causeEventIds:[...causeEventIds]};
    const id=this.emit(posting);this.history.push(Object.freeze({...posting,id,crews:Object.freeze(posting.crews.map(unit=>Object.freeze(unit))),
      equipment:Object.freeze(posting.equipment.map(unit=>Object.freeze(unit))),causeEventIds:Object.freeze([...posting.causeEventIds])}));return id;
  }
  snapshot(instant:number):ResourceSnapshot{
    const shift=this.currentShift(instant),crewPools=new Set([...Object.values(this.plan.crewsByShift).flatMap(Object.keys),
      ...[...this.allocations.values()].flatMap(a=>a.crews.map(unit=>unit.pool))]);
    const equipmentPools=new Set([...Object.keys(this.plan.equipment),...[...this.allocations.values()].flatMap(a=>a.equipment.map(unit=>unit.pool))]);
    const crews=[...crewPools].sort().map(pool=>{const capacity=this.plan.crewsByShift[shift??'']?.[pool]??0,used=this.used('crews',pool,shift);
      return {pool,capacity,used,available:Math.max(0,capacity-used)};});
    const equipment=[...equipmentPools].sort().map(pool=>{const capacity=this.plan.equipment[pool]??0,used=this.used('equipment',pool,shift);
      return {pool,capacity,used,available:Math.max(0,capacity-used)};});
    return {shift,crews,equipment,allocations:[...this.allocations.values()].map(a=>({...a,crews:a.crews.map(x=>({...x})),equipment:a.equipment.map(x=>({...x}))})),
      outages:this.outages.map(outage=>({...outage,state:instant<outage.start?'scheduled':instant<outage.end?'active':'recovered'}))};
  }
}
