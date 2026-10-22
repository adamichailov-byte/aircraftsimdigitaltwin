import type {FleetConfig,FleetSnapshot,FlowEvent} from './flow.ts';
import type {TaskDefinition} from './tasks.ts';
import {calendarStateAt} from './calendar.ts';
import {defaultStationBufferMs,stationBufferDeadline} from './station-buffer.ts';

export const residenceKinds=['productive','material','resource','equipment','quality','daily','buffer','flow','offshift','elapsed','offsite','transfer','other'] as const;
export type ResidenceKind=typeof residenceKinds[number];
export type Residence={serialId:string;station:string;from:number;to:number;kind:ResidenceKind;label:string;eventIds:string[]};
type Unit={pool:string;unit:number};
type Lease={shift:string|null;crews:readonly Unit[];equipment:readonly Unit[]};

/** Event-only projection of physical residence. No dispatch, forecast or checkpoint sampling. */
export function stationResidence(config:FleetConfig,fleet:FleetSnapshot,events:readonly FlowEvent[],from:number,to:number):Residence[]{
  const definitions=new Map(fleet.aircraft.map(a=>[a.id,a.tasks]));
  const state=new Map<string,string>(),completed=new Map<string,number>(),enabled=new Set<string>();
  const owners=new Map<string,{slot:string;eventId:string}>(),transfers=new Map<string,FlowEvent>();
  const leases=new Map<string,Lease>(),reserved=new Map<string,Record<string,number>>(),issued=new Set<string>();
  const stock=new Map<string,number>(),stockCause=new Map<string,string>(),lastEvent=new Map<string,string>();
  const deferred=new Set<string>(),failures=new Map<string,number>();
  const key=(serial:string,id:string)=>`${serial}/${id}`;
  for(const [serial,tasks] of definitions)for(const task of tasks)if(!/\/(repair|recheck)-/.test(task.id))enabled.add(key(serial,task.id));
  for(const lot of config.materials.initial)stock.set(lot.sku,(stock.get(lot.sku)??0)+lot.quantity-lot.quarantined);
  const receipts=new Map(config.materials.receipts.map(r=>[r.id,r]));
  const points=[...new Set([config.recipe.start,from,to,...events.map(e=>e.instant),
    ...config.recipe.calendar.working.flatMap(i=>[i.start,i.end]),...config.recipe.calendar.shifts.flatMap(i=>[i.start,i.end]),
    ...(config.resources.outages??[]).flatMap(i=>[i.start,i.end])])].filter(t=>t>=config.recipe.start&&t<=to).sort((a,b)=>a-b);
  const result:Residence[]=[],last=new Map<string,Residence>();let cursor=0;
  const add=(row:Residence)=>{if(row.to<=row.from)return;const id=`${row.serialId}/${row.station}`,prior=last.get(id);
    if(prior&&prior.to===row.from&&prior.kind===row.kind&&prior.label===row.label){prior.to=row.to;prior.eventIds=[...new Set([...prior.eventIds,...row.eventIds])];}
    else{result.push(row);last.set(id,row);}};
  const apply=(event:FlowEvent)=>{
    const id=key(event.serialId,event.taskId??'');if(owners.has(event.serialId)||event.kind==='admitted')lastEvent.set(event.serialId,event.id);
    if(event.kind==='admitted')owners.set(event.serialId,{slot:event.toSlot??'queue-1',eventId:event.id});
    if(event.kind==='transfer-started')transfers.set(event.serialId,event);
    if(event.kind==='source-cleared')owners.delete(event.serialId);
    if(event.kind==='transfer-arrived'){transfers.delete(event.serialId);if(event.toSlot!=='departed')owners.set(event.serialId,{slot:event.toSlot!,eventId:event.id});}
    if(event.kind==='delivered')owners.delete(event.serialId);
    if(event.kind==='task-started'||event.kind==='task-resumed'){state.set(id,'running');deferred.delete(id);}
    if(event.kind==='task-completed'){state.set(id,'complete');completed.set(id,event.instant);}
    if(event.kind==='task-paused')state.set(id,'paused');
    if(event.kind==='quality-hold')state.set(id,'hold');
    if(event.kind==='task-deferred')deferred.add(id);
    if(event.kind==='task-ready')deferred.delete(id);
    if(event.kind==='rework-scheduled'){
      const source=(event.taskId??'').split('/')[0],k=key(event.serialId,source),cycle=(failures.get(k)??0)+1;failures.set(k,cycle);
      enabled.add(key(event.serialId,`${source}/repair-${cycle}`));enabled.add(key(event.serialId,`${source}/recheck-${cycle+1}`));
    }
    if(event.resource){const r=event.resource,k=key(r.serialId,r.taskId),prior=leases.get(k);
      if(event.kind==='resource-allocated')leases.set(k,{shift:r.shift,crews:r.crews,equipment:r.equipment});
      if(event.kind==='resource-released'&&prior){
        const remaining=(units:readonly Unit[],removed:readonly Unit[])=>units.filter(u=>!removed.some(v=>v.pool===u.pool&&v.unit===u.unit));
        const crews=remaining(prior.crews,r.crews),equipment=remaining(prior.equipment,r.equipment);
        if(crews.length||equipment.length)leases.set(k,{...prior,crews,equipment});else leases.delete(k);
      }
    }
    const posting=event.material;if(!posting)return;
    const k=key(event.serialId,event.taskId??posting.taskId??''),quantities:Record<string,number>={};
    for(const allocation of posting.allocations){const {sku,quantity}=allocation;quantities[sku]=(quantities[sku]??0)+quantity;stockCause.set(sku,event.id);}
    if(event.kind==='material-delivered'){
      const receipt=receipts.get(posting.receiptId??'');
      for(const [sku,n] of Object.entries(quantities))stock.set(sku,(stock.get(sku)??0)+n-(receipt?.lot.quarantined??0));
    }
    if(event.kind==='material-reserved'){reserved.set(k,quantities);for(const [sku,n] of Object.entries(quantities))stock.set(sku,(stock.get(sku)??0)-n);}
    if(event.kind==='material-issued'){issued.add(k);reserved.delete(k);}
    if(event.kind==='material-released'){reserved.delete(k);for(const [sku,n] of Object.entries(quantities))stock.set(sku,(stock.get(sku)??0)+n);}
  };
  const classify=(serial:string,slot:string,at:number):{kind:ResidenceKind;label:string;causes?:string[];until?:number}=>{
    const tasks=(definitions.get(serial)??config.recipe.tasks).filter(t=>t.stationId===slot&&enabled.has(key(serial,t.id)));
    const phase=(task:TaskDefinition)=>state.get(key(serial,task.id));
    const active=tasks.filter(t=>phase(t)==='running'&&t.kind!=='transfer');
    if(transfers.has(serial))return{kind:'transfer',label:'Tow in progress · source held until tail-clear'};
    if(active.some(t=>t.kind==='offsite'))return{kind:'offsite',label:'Offsite flight · return stand retained'};
    if(active.some(t=>t.durationMode!=='elapsed'))return{kind:'productive',label:active.filter(t=>t.durationMode!=='elapsed').map(t=>t.label).join(' + ')};
    if(active.length)return{kind:'elapsed',label:active.map(t=>t.label).join(' + ')};
    const period=calendarStateAt(config.recipe.calendar,at);
    if(period.status!=='working')return{kind:'offshift',label:period.status==='break'?'Scheduled break':'Outside staffed calendar'};
    const ready=tasks.filter(t=>!['complete','hold'].includes(phase(t)??'')&&t.prerequisites.every(p=>!enabled.has(key(serial,p))||state.get(key(serial,p))==='complete'));
    const work=ready.filter(t=>t.kind!=='transfer');
    const outage=work.find(t=>Object.keys(t.equipmentRequirements??{}).some(pool=>(config.resources.outages??[]).some(o=>o.equipmentId===pool&&o.start<=at&&at<o.end)));
    if(outage)return{kind:'equipment',label:`Equipment outage · ${outage.label}`};
    const missing=work.flatMap(t=>issued.has(key(serial,t.id))?[]:Object.entries(t.materialRequirements).filter(([sku,n])=>(stock.get(sku)??0)+(reserved.get(key(serial,t.id))?.[sku]??0)<n).map(([sku,n])=>({t,sku,n})));
    if(missing.length)return{kind:'material',label:[...new Set(missing.map(m=>`${m.t.label} · ${m.sku} needs ${m.n}`))].join('; '),causes:missing.flatMap(m=>stockCause.get(m.sku)??[])};
    const unavailable=work.find(t=>{
      const own=leases.get(key(serial,t.id));
      const used=(kind:'crews'|'equipment',pool:string)=>[...leases.values()].reduce((n,l)=>n+(kind==='crews'&&l.shift!==period.shift?0:l[kind].filter(u=>u.pool===pool).length),0);
      return Object.entries(t.crewRequirements).some(([pool,n])=>(config.resources.crewsByShift[period.shift??'']?.[pool]??0)-used('crews',pool)+(own?.shift===period.shift?own.crews.filter(u=>u.pool===pool).length??0:0)<n)
        ||Object.entries(t.equipmentRequirements??{}).some(([pool,n])=>(config.resources.equipment[pool]??0)-used('equipment',pool)+(own?.equipment.filter(u=>u.pool===pool).length??0)<n);
    });
    if(unavailable)return{kind:'resource',label:`Crew or equipment unavailable · ${unavailable.label}`};
    if(tasks.some(t=>phase(t)==='hold'))return{kind:'quality',label:'Quality hold · inspection failed after repair limit'};
    if(work.some(t=>deferred.has(key(serial,t.id))))return{kind:'daily',label:'Waiting for next daily start window'};
    const tow=ready.find(t=>t.kind==='transfer');
    if(tow){
      const readyAt=Math.max(config.recipe.start,...tow.prerequisites.map(p=>completed.get(key(serial,p))??config.recipe.start));
      const deadline=config.holdStationBuffers&&!slot.startsWith('queue-')?stationBufferDeadline(config.recipe.calendar,readyAt,
        config.stationBuffersMs?.[slot==='delivery-2'?'delivery':slot]??config.stationBufferMs??defaultStationBufferMs):readyAt;
      if(at<deadline)return{kind:'buffer',label:'Planned station handoff buffer',until:deadline};
      return{kind:'flow',label:`Ready for transfer · awaiting destination / tug / corridor · ${tow.label}`};
    }
    return{kind:'other',label:'Station residence · prerequisite or dispatch wait'};
  };
  for(let i=0;i<points.length-1;i++){
    const at=points[i],next=points[i+1];while(cursor<events.length&&events[cursor].instant<=at)apply(events[cursor++]);
    if(next<=from)continue;
    for(const [serial,owner] of owners){let begin=Math.max(from,at);
      while(begin<next){const category=classify(serial,owner.slot,begin),end=Math.min(next,category.until??next);
        add({serialId:serial,station:owner.slot,from:begin,to:end,kind:category.kind,label:category.label,
          eventIds:[...new Set([owner.eventId,lastEvent.get(serial)??owner.eventId,...(category.causes??[])])]});begin=end;}
    }
  }
  return result;
}
