import type {FleetSnapshot,FlowEvent} from '../simulation/flow.ts';
import {localInstant} from '../simulation/calendar.ts';

export const FLOW_STATIONS=[
  {id:'queue-1',label:'Queue 01'},{id:'queue-2',label:'Queue 02'},{id:'queue-3',label:'Queue 03'},
  {id:'bay-1',label:'Bay 01'},{id:'bay-2',label:'Bay 02'},{id:'bay-3',label:'Bay 03'},
  {id:'bay-4',label:'Bay 04'},{id:'bay-5',label:'Bay 05'},{id:'bay-6',label:'Bay 06'},
  {id:'paint',label:'Paint'},{id:'acceptance',label:'Acceptance'},{id:'flight-test',label:'Flight test'},
  {id:'delivery',label:'Delivery'},
] as const;
export type TimelineKind='productive'|'blocked'|'offshift'|'transfer'|'offsite'|'delivery';
export type TimelineSegment={id:string;serialId:string;kind:TimelineKind;station:string;start:number;end:number;
  label:string;reason:string;taskId?:string;from?:string;to?:string;clippedStart:boolean;clippedEnd:boolean};
export type TimelineTick={instant:number;label:string;granularity:'hour'|'day'|'month'};
export function formatTimelineDuration(ms:number){
  if(ms<=0)return'point event';if(ms<60000)return`${Math.round(ms/1000)}s`;const minutes=Math.round(ms/60000);
  return minutes<60?`${minutes}m`:minutes<1440?`${(minutes/60).toFixed(1)}h`:`${(ms/86400000).toFixed(1)}d`;
}

const taskState=(aircraft:FleetSnapshot['aircraft'][number],id:string)=>aircraft.pilot.tasks.find(task=>task.taskId===id);
const slotLane=(slot:string|undefined)=>{
  if(!slot)return'queue-1';if(slot.startsWith('queue-'))return slot;
  if(slot==='flightline')return'acceptance';if(slot==='delivery-2'||slot==='departed')return'delivery';
  return FLOW_STATIONS.some(station=>station.id===slot)?slot:'queue-1';
};
const taskLane=(station:string|undefined,kind:string|undefined)=>kind==='offsite'?'flight-test':slotLane(station);
const laneLabel=(id:string|undefined)=>FLOW_STATIONS.find(station=>station.id===id)?.label??(id??'Unknown station');
const clip=(segment:Omit<TimelineSegment,'clippedStart'|'clippedEnd'>,from:number,to:number):TimelineSegment|null=>{
  if(segment.end<from||segment.start>to)return null;
  return {...segment,start:Math.max(from,segment.start),end:Math.min(to,segment.end),
    clippedStart:segment.start<from,clippedEnd:segment.end>to};
};
/** Projects only recorded events and the selected recorded state; it never predicts work. */
export function buildFlowTimeline({fleet,events,at,historical,from,to}:{fleet:FleetSnapshot|null;
  events:readonly FlowEvent[];at:number;historical:boolean;from:number;to:number}):{segments:TimelineSegment[];stations:typeof FLOW_STATIONS}{
  if(!fleet)return{segments:[],stations:FLOW_STATIONS};
  const limit=at,visibleEvents=events.filter(event=>event.instant<=limit).slice().sort((a,b)=>a.instant-b.instant||a.sequence-b.sequence);
  const bySerial=new Map(fleet.aircraft.map(aircraft=>[aircraft.id,aircraft]));
  const eventById=new Map(visibleEvents.map(event=>[event.id,event]));
  const eventsBySerial=new Map<string,FlowEvent[]>(),arrivals=new Map<string,FlowEvent>();
  for(const event of visibleEvents){
    if(event.serialId){const list=eventsBySerial.get(event.serialId)??[];list.push(event);eventsBySerial.set(event.serialId,list);}
    if(event.kind==='transfer-arrived'&&event.transferId)arrivals.set(`${event.serialId}/${event.transferId}`,event);
  }
  const generated:Omit<TimelineSegment,'clippedStart'|'clippedEnd'>[]=[];
  const adds=new Set<string>();
  for(const event of visibleEvents){
    const aircraft=bySerial.get(event.serialId);if(!aircraft)continue;
    if(aircraft.state==='delivered'&&!historical)continue;
    if(event.kind==='transfer-started'&&event.transferId){
      const arrived=arrivals.get(`${event.serialId}/${event.transferId}`);
      const end=arrived?.instant??(aircraft.state==='transferring'?limit:event.instant);
      const key=`transfer/${event.transferId}`;if(!adds.has(key)&&end>=event.instant){adds.add(key);generated.push({id:key,serialId:event.serialId,
        kind:'transfer',station:slotLane(event.fromSlot),start:event.instant,end,label:`${laneLabel(slotLane(event.fromSlot))} → ${laneLabel(slotLane(event.toSlot))}`,
        reason:`${laneLabel(slotLane(event.fromSlot))} → ${laneLabel(slotLane(event.toSlot))}`,
        from:slotLane(event.fromSlot),to:slotLane(event.toSlot)});}
    }
    if(event.kind==='delivered')generated.push({id:`delivery/${event.id}`,serialId:event.serialId,kind:'delivery',station:'delivery',
      start:event.instant,end:event.instant,label:'Aircraft delivered',reason:'Removed from live plant; retained in run history'});
  }
  for(const aircraft of fleet.aircraft){
    if(aircraft.state==='delivered'&&!historical)continue;
    const perAircraft=eventsBySerial.get(aircraft.id)??[];
    const admitted=perAircraft.find(event=>event.kind==='admitted')?.instant??aircraft.admittedAt;
    const tasks=new Map(aircraft.tasks.map(task=>[task.id,task]));
    const timelineTasks=new Set([...tasks.keys(),...aircraft.pilot.tasks.map(task=>task.taskId)]);
    for(const id of timelineTasks){
      const definition=tasks.get(id),state=taskState(aircraft,id);
      if(!definition||definition.kind==='transfer')continue;
      const taskEvents=perAircraft.filter(event=>event.taskId===id&&event.kind.startsWith('task-'));
      for(const deferred of taskEvents.filter(event=>event.kind==='task-deferred')){
        const ready=taskEvents.find(event=>event.sequence>deferred.sequence&&(event.kind==='task-ready'||event.kind==='task-started'));
        const finish=Math.min(ready?.instant??limit,limit);
        if(finish>deferred.instant)generated.push({id:`daily/${aircraft.id}/${id}/${deferred.id}`,serialId:aircraft.id,
          kind:'offshift',station:taskLane(definition.stationId,definition.kind),start:deferred.instant,end:finish,
          taskId:id,label:definition.label,reason:'Waiting for a daily start window · finish this job within one local workday'});
      }
      let open:FlowEvent|null=null;
      for(const event of taskEvents){
        if(event.kind==='task-started'||event.kind==='task-resumed'){
          if(open&&event.instant>open.instant)generated.push({id:`work/${aircraft.id}/${id}/${open.id}`,serialId:aircraft.id,
            kind:definition.kind==='offsite'?'offsite':'productive',station:taskLane(definition.stationId,definition.kind),start:open.instant,end:event.instant,
            taskId:id,label:definition.label,reason:definition.kind==='offsite'?'Offsite flight activity':'Productive work'});
          open=event;
        }else if((event.kind==='task-completed'||event.kind==='task-paused')&&open){
          if(event.instant>open.instant)generated.push({id:`work/${aircraft.id}/${id}/${open.id}`,serialId:aircraft.id,
            kind:definition.kind==='offsite'?'offsite':'productive',station:taskLane(definition.stationId,definition.kind),start:open.instant,end:event.instant,
            taskId:id,label:definition.label,reason:definition.kind==='offsite'?'Offsite flight activity':'Productive work'});
          open=null;
        }
      }
      const pauses=taskEvents.filter(event=>event.kind==='task-paused'),resumes=taskEvents.filter(event=>event.kind==='task-started'||event.kind==='task-resumed');
      for(const pause of pauses){
        const resume=resumes.find(item=>item.sequence>pause.sequence);
        const finish=Math.min(resume?.instant??limit,limit);if(finish<=pause.instant)continue;
        const causes=pause.causeEventIds.map(id=>eventById.get(id)).filter(Boolean),outage=causes.find(item=>item?.kind==='equipment-outage-started');
        const reason=outage?.label??(causes.some(item=>item?.kind==='calendar-boundary')?'Outside staffed shift':'Equipment or task hold');
        generated.push({id:`pause/${aircraft.id}/${id}/${pause.id}`,serialId:aircraft.id,kind:outage?'blocked':'offshift',
          station:taskLane(definition.stationId,definition.kind),start:pause.instant,end:finish,taskId:id,label:definition.label,reason});
      }
      if(open){
        const finish=Math.max(open.instant,limit);
        if(finish>open.instant)generated.push({id:`work/${aircraft.id}/${id}/${open.id}`,serialId:aircraft.id,
          kind:definition.kind==='offsite'?'offsite':'productive',station:taskLane(definition.stationId,definition.kind),start:open.instant,end:finish,
          taskId:id,label:definition.label,reason:definition.kind==='offsite'?'Offsite flight activity':'Productive work'});
      }
      if(state&&(state.state==='waiting-material'||state.state==='waiting-resource')){
        const prerequisiteEnds=definition.prerequisites.map(prerequisite=>perAircraft.filter(event=>event.taskId===prerequisite&&event.kind==='task-completed')
          .at(-1)?.instant).filter((instant):instant is number=>instant!==undefined);
        const ready=Math.max(admitted,...prerequisiteEnds);
        const begun=taskEvents.filter(event=>event.kind==='task-started'||event.kind==='task-resumed').at(0)?.instant;
        const finish=Math.min(begun??limit,limit);if(finish>ready){
          const material=state.state==='waiting-material',reason=material?(state.materialBlockers?.join(' · ')||'Waiting for required material')
            :state.state==='waiting-resource'?(state.resourceBlockers?.join(' · ')||'Waiting for crew or equipment')
              :state.state==='paused-equipment'?(state.resourceBlockers?.join(' · ')||'Equipment unavailable'):'Quality hold';
          generated.push({id:`blocked/${aircraft.id}/${id}/${ready}`,serialId:aircraft.id,kind:'blocked',station:taskLane(definition.stationId,definition.kind),
            start:ready,end:finish,taskId:id,label:definition.label,reason});
        }
      }
    }
  }
  const segments=generated.map(segment=>clip(segment,from,to)).filter((segment):segment is TimelineSegment=>segment!==null
    &&(segment.start<segment.end||segment.kind==='delivery'))
    .sort((a,b)=>a.start-b.start||a.serialId.localeCompare(b.serialId)||a.id.localeCompare(b.id));
  return{segments,stations:FLOW_STATIONS};
}

export function filterTimelineEvents(segments:readonly TimelineSegment[],filter:string):TimelineSegment[]{
  return filter==='all'?[...segments]:segments.filter(item=>item.serialId===filter);
}

/** Calendar-aware ticks, with short date labels at day/month granularity. */
export function calendarTicks(from:number,to:number,widthPx:number,timeZone='America/New_York'):TimelineTick[]{
  if(to<=from)return[];
  const span=to-from,step=span<=36*3600000?6*3600000:span<=9*86400000?86400000:span<=28*86400000?7*86400000:30*86400000;
  const granularity:TimelineTick['granularity']=step>=28*86400000?'month':step>=86400000?'day':'hour';
  const format=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
  const localDate=(instant:number)=>{const parts=format.formatToParts(instant),part=(type:Intl.DateTimeFormatPartTypes)=>parts.find(item=>item.type===type)?.value??'00';
    return`${part('year')}-${part('month')}-${part('day')}`;};
  const dayNumber=(date:string)=>{const[year,month,day]=date.split('-').map(Number);return Date.UTC(year,month-1,day);};
  let candidate:number;
  if(granularity==='month'){
    const month=localDate(from).slice(0,7);candidate=localInstant(`${month}-01T00:00`,timeZone);
    if(candidate<from){const next=new Date(dayNumber(`${month}-01`));next.setUTCMonth(next.getUTCMonth()+1);candidate=localInstant(`${next.toISOString().slice(0,7)}-01T00:00`,timeZone);}
  }else if(granularity==='day'){
    const date=localDate(from);candidate=localInstant(`${date}T00:00`,timeZone);
    if(candidate<from){const next=new Date(dayNumber(date)+86400000);candidate=localInstant(`${next.toISOString().slice(0,10)}T00:00`,timeZone);}
  }else candidate=Math.ceil(from/step)*step;
  const ticks:TimelineTick[]=[];const max=Math.max(2,Math.floor(widthPx/90));
  while(candidate<=to&&ticks.length<max){
    const label=granularity==='month'?new Intl.DateTimeFormat('en-US',{timeZone,month:'short',year:'numeric'}).format(candidate)
      :granularity==='day'?new Intl.DateTimeFormat('en-US',{timeZone,month:'short',day:'numeric'}).format(candidate)
        :new Intl.DateTimeFormat('en-US',{timeZone,month:'short',day:'numeric',hour:'2-digit',hourCycle:'h23'}).format(candidate);
    ticks.push({instant:candidate,label,granularity});
    if(granularity==='month'){const next=new Date(dayNumber(`${localDate(candidate).slice(0,7)}-01`));next.setUTCMonth(next.getUTCMonth()+1);candidate=localInstant(`${next.toISOString().slice(0,7)}-01T00:00`,timeZone);}
    else if(granularity==='day'){const next=new Date(dayNumber(localDate(candidate))+86400000);candidate=localInstant(`${next.toISOString().slice(0,10)}T00:00`,timeZone);}
    else candidate+=step;
  }
  return ticks;
}
