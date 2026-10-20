import type {FlowEvent,FleetSnapshot} from './flow.ts';
import {activityTimes} from './schedule.ts';
import type {ActivityTimes} from './schedule.ts';
import type {TaskSnapshot} from './tasks.ts';

export const MAX_HISTORY_CHECKPOINTS=128;

export type HistoryCheckpoint={instant:number;eventSequence:number;snapshot:FleetSnapshot};
export type HistoryLedger={events:readonly FlowEvent[];checkpoints:readonly HistoryCheckpoint[];cursor:number|null};

type TaskDefinitions=FleetSnapshot['aircraft'][number]['tasks'];
type Pilot=FleetSnapshot['aircraft'][number]['pilot'];
type ReusedPilotState={signature:string;aircraft:Pilot['aircraft'];tasks:Pilot['tasks']};
function compact(snapshot:FleetSnapshot,definitions:Map<string,TaskDefinitions>,pilotStates:Map<string,ReusedPilotState>,intern:(key:string,value:unknown)=>unknown):FleetSnapshot{
  const inventory=intern('inventory',{...snapshot.inventory,history:[]}) as FleetSnapshot['inventory'];
  const resources=intern('resources',snapshot.resources) as FleetSnapshot['resources'];
  const logistics=intern('logistics',snapshot.logistics) as FleetSnapshot['logistics'];
  return {...snapshot,history:[],inventory,resources,logistics,
    aircraft:snapshot.aircraft.map(aircraft=>{
      const signature=JSON.stringify(aircraft.tasks),tasks=definitions.get(signature)??aircraft.tasks;
      if(!definitions.has(signature))definitions.set(signature,tasks);
      const pilotStateSignature=JSON.stringify({status:aircraft.pilot.status,aircraft:aircraft.pilot.aircraft,tasks:aircraft.pilot.tasks,
        nextEventInstant:aircraft.pilot.nextEventInstant});
      const previous=pilotStates.get(aircraft.id),state=previous?.signature===pilotStateSignature?previous:{signature:pilotStateSignature,
        aircraft:aircraft.pilot.aircraft,tasks:aircraft.pilot.tasks};
      pilotStates.set(aircraft.id,state);
      return {...aircraft,tasks,pilot:{...aircraft.pilot,aircraft:state.aircraft,tasks:state.tasks,history:[]}};
    })};
}

/** Stores immutable engine projections. It never advances or reconstructs the simulation. */
export class HistoryArchive{
  private events:FlowEvent[]=[];
  private checkpoints:HistoryCheckpoint[]=[];
  private taskDefinitions=new Map<string,TaskDefinitions>();
  private pilotStates=new Map<string,ReusedPilotState>();
  private lastSections=new Map<string,{signature:string;value:unknown}>();
  private readonly eventLimit:number;
  constructor(eventLimit:number){this.eventLimit=eventLimit;}
  clear(){this.events=[];this.checkpoints=[];this.taskDefinitions.clear();this.pilotStates.clear();this.lastSections.clear();}
  append(events:readonly FlowEvent[]){
    for(const event of events){
      const latest=this.events.at(-1);
      if(this.events.length>=this.eventLimit||latest?.runId===event.runId&&event.sequence<=latest.sequence)continue;
      this.events.push(event);
    }
  }
  record(snapshot:FleetSnapshot,pinnedInstant:number|null=null){
    const intern=(key:string,value:unknown)=>{const signature=JSON.stringify(value),previous=this.lastSections.get(key);
      if(previous?.signature===signature)return previous.value;this.lastSections.set(key,{signature,value});return value;};
    const checkpoint={instant:snapshot.instant,eventSequence:snapshot.eventCount,
      snapshot:compact(snapshot,this.taskDefinitions,this.pilotStates,intern)};
    const last=this.checkpoints.at(-1);
    if(last?.instant===checkpoint.instant)this.checkpoints[this.checkpoints.length-1]=checkpoint;
    else this.checkpoints.push(checkpoint);
    if(this.checkpoints.length>MAX_HISTORY_CHECKPOINTS){
      const latest=this.checkpoints.at(-1)!,pinned=this.checkpoints.find(point=>point.instant===pinnedInstant);
      this.checkpoints=this.checkpoints.filter((point,index)=>index===0||index%2===0||point===pinned);
      if(this.checkpoints.at(-1)?.instant!==latest.instant)this.checkpoints.push(latest);
    }
  }
  snapshot(cursor:number|null):HistoryLedger{return {events:this.events,checkpoints:this.checkpoints,cursor};}
}

/** One primary delay category per interval; concurrent explanations stay listed separately. */
export function classifyTaskTime(task:TaskSnapshot,aircraftReasons:readonly string[]=[]){
  const primary=task.state==='running'?'productive work':task.state==='complete'?'complete':task.state==='paused-off-shift'?'off shift'
    :task.state==='paused-equipment'?'equipment outage':task.state==='waiting-material'?'missing material'
    :task.state==='waiting-resource'?'crew or equipment unavailable':task.state==='waiting-day-window'?'awaiting daily start window':task.state==='quality-hold'?'quality hold'
    :task.waitingFor.length>0?'predecessor task':aircraftReasons.length>0?'downstream space or route':'queued';
  const blockers=[...new Set([...(task.materialBlockers??[]),...(task.resourceBlockers??[]),...(task.calendarBlockers??[]),...aircraftReasons,
    ...task.waitingFor.map(id=>`waiting for ${id}`)])];
  return {primary,blockers};
}

export function historyCheckpointAt(ledger:HistoryLedger,instant:number){
  return ledger.checkpoints.find(checkpoint=>checkpoint.instant===instant)??null;
}

export function projectHistory(checkpoint:HistoryCheckpoint,events:readonly FlowEvent[]):FleetSnapshot{
  const visible=events.filter(event=>event.runId===checkpoint.snapshot.runId&&event.instant<=checkpoint.instant);
  const taskEvents=visible.filter(event=>event.taskId&&['task-started','task-completed','task-paused','task-resumed','task-deferred','task-ready',
    'inspection-passed','inspection-failed','rework-scheduled','quality-hold','equipment-outage-started','equipment-outage-ended'].includes(event.kind));
  const inventoryHistory=visible.flatMap(event=>event.material?[event.material]:[]);
  const aircraft=checkpoint.snapshot.aircraft.map(item=>({...item,pilot:{...item.pilot,history:taskEvents.filter(event=>event.serialId===item.id)
    .slice(-16).map(event=>({id:event.id,runId:event.runId,sequence:event.sequence,instant:event.instant,phase:1 as const,
      kind:event.kind as 'task-started',entityIds:event.entityIds,causeEventIds:event.causeEventIds,payloadVersion:1 as const,
      payload:{taskId:event.taskId,label:event.label}}))}}));
  return {...checkpoint.snapshot,aircraft,history:visible.slice(-32),inventory:{...checkpoint.snapshot.inventory,history:inventoryHistory}};
}

export function historyActivityTimes(ledger:HistoryLedger,instant:number):ActivityTimes{
  return activityTimes(ledger.events.filter(event=>event.runId===ledger.checkpoints[0]?.snapshot.runId&&event.instant<=instant));
}

export function nearestHistoryCheckpoint(ledger:HistoryLedger,instant:number):HistoryCheckpoint|null{
  let nearest:HistoryCheckpoint|null=null;
  for(const checkpoint of ledger.checkpoints){if(checkpoint.instant>instant)break;nearest=checkpoint;}
  return nearest;
}
