import { addWorkingTime, calendarStateAt, nextBoundary, workingTimeBetween, workingTimeLeftToday } from './calendar.ts';
import { SimulationClock } from './clock.ts';
import { validateRecipe } from './tasks.ts';
import { transfers } from './transfers.ts';
import { inspectionFails, validateQualityPlan } from './disruptions.ts';
import type { QualityPlan } from './disruptions.ts';
import type { PilotDefinition, PilotSnapshot, TaskDefinition, TaskEvent, TaskState, TaskMaterials, TaskResources } from './tasks.ts';

type ActiveTask = { definition: TaskDefinition; state: TaskState; remaining: number;
  startedAt: number | null; completedAt: number | null; startEventId: string | null; completionEventId: string | null; generation:number };
type QueuedEvent = { instant: number; phase: 0 | 1; sequence: number; taskId?: string; label: string; generation?:number };

/** One aircraft's task clock. Fleet mode supplies shared resource and material adapters. */
export class TaskEngine {
  readonly definition: PilotDefinition;
  private runId: string;
  private instant: number;
  private revision = 0;
  private queueSequence = 0;
  private queue: QueuedEvent[] = [];
  private tasks: ActiveTask[] = [];
  private taskById = new Map<string,ActiveTask>();
  private taskDefinitions: readonly TaskDefinition[] = [];
  private dispatchOrder: ActiveTask[] = [];
  private history: TaskEvent[] = [];
  private snapshot!: PilotSnapshot;
  private canStart: (task: TaskDefinition) => boolean;
  private materials?:TaskMaterials;
  private resources?:TaskResources;
  private quality?:QualityPlan;
  private qualityStates=new Map<string,'failed'|'passed'|'repair'|'reinspection'|'hold'>();
  private qualityTaskIds=new Map<string,Set<string>>();

  constructor(definition: PilotDefinition, runId = 'pilot-1', canStart: (task: TaskDefinition) => boolean = () => true,
    materials?:TaskMaterials,resources?:TaskResources,disruptions?:{quality?:QualityPlan}) {
    this.materials=materials;
    this.resources=resources;
    this.quality=disruptions?.quality?Object.freeze({...disruptions.quality,
      failureProbabilityByTask:Object.freeze({...disruptions.quality.failureProbabilityByTask})}):undefined;
    if(this.quality){validateQualityPlan(this.quality);for(const taskId of Object.keys(this.quality.failureProbabilityByTask))
      if(!definition.tasks.some(task=>task.id===taskId&&task.qualityCheck))throw new RangeError(`Unknown quality inspection task ${taskId}.`);}
    this.canStart=canStart;
    validateRecipe(definition.tasks);
    if (!definition.serialId || definition.availability !== 'assumed-abundant'
      || !Number.isSafeInteger(definition.start) || !Number.isSafeInteger(definition.end)
      || definition.start < definition.calendar.start || definition.end > definition.calendar.end || definition.end <= definition.start) {
      throw new RangeError('Invalid pilot horizon, aircraft or availability assumption.');
    }
    // Freeze a copy so caller edits cannot change a run mid-flight.
    this.definition = Object.freeze({ ...definition, calendar: Object.freeze({ ...definition.calendar,
      working: Object.freeze(definition.calendar.working.map(interval => Object.freeze({...interval}))),
      shifts: Object.freeze(definition.calendar.shifts.map(shift => Object.freeze({...shift}))),
      boundaries: Object.freeze(definition.calendar.boundaries.map(boundary => Object.freeze({...boundary}))),
    }), tasks: Object.freeze(definition.tasks.map(task => Object.freeze({
      ...task, prerequisites: Object.freeze([...task.prerequisites]), completionMilestones: Object.freeze([...task.completionMilestones]),
      crewRequirements: Object.freeze({...task.crewRequirements}), materialRequirements: Object.freeze({...task.materialRequirements}),
      equipmentRequirements: Object.freeze({...task.equipmentRequirements}),
      qualityCheck:task.qualityCheck?Object.freeze({...task.qualityCheck,repairCrewRequirements:Object.freeze({...task.qualityCheck.repairCrewRequirements})}):undefined,
      holdEquipmentOffShift:task.holdEquipmentOffShift??false,
    }))) });
    this.runId = runId; this.instant = definition.start;
    this.reset(runId);
  }

  getSnapshot = () => this.snapshot;
  getTaskDefinitions = () => this.taskDefinitions;

  private indexTasks(){
    this.taskById=new Map(this.tasks.map(task=>[task.definition.id,task]));
    this.taskDefinitions=Object.freeze(this.tasks.map(task=>task.definition));
    this.dispatchOrder=[...this.tasks].sort((a,b)=>a.definition.id<b.definition.id?-1:1);
  }

  reset(runId: string) {
    this.runId = runId; this.instant = this.definition.start;
    this.history = []; this.queue = []; this.queueSequence = 0;this.qualityStates.clear();this.qualityTaskIds.clear();
    this.tasks = this.definition.tasks.map(definition => ({ definition, state: 'pending', remaining: definition.durationMs,
      startedAt: null, completedAt: null, startEventId: null, completionEventId: null,generation:0 }));
    this.indexTasks();
    this.dispatch(); this.queueBoundary(); this.publish();
  }

  private record(kind: TaskEvent['kind'], phase: TaskEvent['phase'], label: string, taskId?: string, causes: string[] = []) {
    const sequence = this.history.length + 1;
    const event: TaskEvent = Object.freeze({ id: `${this.runId}:${sequence}`, runId: this.runId, sequence,
      instant: this.instant, phase, kind, payloadVersion: 1,
      entityIds: Object.freeze(taskId ? [this.definition.serialId, taskId] : [this.definition.serialId]),
      causeEventIds: Object.freeze(causes), payload: Object.freeze({ taskId, label }) });
    this.history.push(event); return event.id;
  }

  private enqueue(event: Omit<QueuedEvent, 'sequence'>) {
    this.queue.push({ ...event, sequence: this.queueSequence++ });
    // ponytail: sorted array is bounded by the pilot's 100-task cap; use a heap if fleet profiling justifies it.
    this.queue.sort((a, b) => a.instant - b.instant || a.phase - b.phase || a.sequence - b.sequence);
  }

  private dispatch() {
    if (this.instant >= this.definition.end) return;
    const working=calendarStateAt(this.definition.calendar,this.instant).status==='working';
    for (const task of this.dispatchOrder) {
      if (!['pending','waiting-day-window','waiting-resource','paused-off-shift','paused-equipment'].includes(task.state)) continue;
      if (!this.canStart(task.definition)) continue;
      if (task.definition.startPolicy !== 'anytime' && !working) continue;
      const prerequisites = task.definition.prerequisites.map(id => this.taskById.get(id)!);
      if (!prerequisites.every(prerequisite => prerequisite.state === 'complete')) continue;
      if(task.definition.finishWithinDay&&task.startedAt===null){
        if(workingTimeLeftToday(this.definition.calendar,this.instant)<task.remaining){
          if(task.state!=='waiting-day-window')this.record('task-deferred',2,`Awaiting next daily start window · ${task.definition.label}`,task.definition.id);
          task.state='waiting-day-window';continue;
        }
        if(task.state==='waiting-day-window'){
          this.record('task-ready',2,`Daily start window open · ${task.definition.label}`,task.definition.id);
          task.state='pending';
        }
      }
      if(this.resources?.blockers(task.definition,this.instant).length){
        task.state=task.startedAt!==null&&this.resources.outageBlockers?.(task.definition,this.instant).length?'paused-equipment':'waiting-resource';continue;
      }
      const issues=this.materials?.issue(task.definition,this.instant);
      if(issues===null)continue;
      const hasResourceRequirements=Object.values(task.definition.crewRequirements).some(Boolean)
        ||Object.values(task.definition.equipmentRequirements??{}).some(Boolean);
      const resourceEvent=hasResourceRequirements?this.resources?.acquire(task.definition,this.definition.serialId,this.instant):null;
      if(this.resources&&hasResourceRequirements&&!resourceEvent)throw new Error(`Resource allocation changed during task dispatch: ${task.definition.id}.`);
      const resuming=task.startedAt!==null;
      task.state='running';task.generation++;
      if(!resuming){task.startedAt=this.instant;task.startEventId=this.record('task-started',2,task.definition.label,task.definition.id,
        [...prerequisites.map(prerequisite=>prerequisite.completionEventId!),...(issues??[]),...(resourceEvent?[resourceEvent]:[])]);}
      else this.record('task-resumed',1,task.definition.label,task.definition.id,resourceEvent?[resourceEvent]:[]);
      this.scheduleCompletion(task);
    }
  }

  private scheduleCompletion(task:ActiveTask){
    const elapsed=task.definition.durationMode==='elapsed';
    const available=elapsed?this.definition.end-this.instant:workingTimeBetween(this.definition.calendar,this.instant,this.definition.end);
    if(available>=task.remaining)this.enqueue({instant:elapsed?this.instant+task.remaining:addWorkingTime(this.definition.calendar,this.instant,task.remaining),
      phase:0,taskId:task.definition.id,label:task.definition.label,generation:task.generation});
  }

  /** External flow gates may become eligible after another aircraft clears space. */
  redispatch() { this.dispatch(); this.publish(); }

  /** The fleet applies the shared outage boundary after same-time task completions. */
  pauseUnavailableEquipment(causeEventId:string){
    for(const task of this.tasks)if(task.state==='running'&&task.definition.kind!=='transfer'
      &&(this.resources?.outageBlockers?.(task.definition,this.instant).length??0)>0){
      task.generation++;task.state='paused-equipment';
      const released=this.resources?.release(task.definition,this.definition.serialId,this.instant,false,[causeEventId])??[];
      this.record('task-paused',1,task.definition.label,task.definition.id,[causeEventId,...released]);
    }
    this.publish();
  }

  private queueBoundaries() {
    if (this.tasks.every(task => task.state === 'complete')) return;
    const next = nextBoundary(this.definition.calendar, this.instant);
    if (next && next.instant <= this.definition.end&&!this.queue.some(event=>event.phase===1)) this.enqueue({ ...next, phase: 1 });
  }

  private queueBoundary(){this.queueBoundaries();}

  private accrue(to: number) {
    const work = workingTimeBetween(this.definition.calendar, this.instant, to);
    for (const task of this.tasks) if (task.startedAt !== null && task.state === 'running') {
      task.remaining = Math.max(0, task.remaining - (task.definition.durationMode === 'elapsed' ? to - this.instant : work));
    }
    this.instant = to;
  }

  private inspect(task:ActiveTask){
    const check=task.definition.qualityCheck;if(!check)return;
    const sourceId=check.originalTaskId??task.definition.id,attempt=check.attempt??1;
    const ids=this.qualityTaskIds.get(sourceId)??new Set([sourceId]);ids.add(task.definition.id);this.qualityTaskIds.set(sourceId,ids);
    const failed=inspectionFails(this.quality?.seed??1,this.definition.serialId,sourceId,attempt,
      this.quality?.failureProbabilityByTask[sourceId]??0);
    if(!failed){this.qualityStates.set(task.definition.id,'passed');
      this.record('inspection-passed',0,`Inspection passed · ${task.definition.label} · attempt ${attempt}`,task.definition.id,[task.completionEventId!]);return;}
    this.qualityStates.set(task.definition.id,'failed');
    this.record('inspection-failed',0,`Inspection failed · ${task.definition.label} · attempt ${attempt}`,task.definition.id,[task.completionEventId!]);
    if(attempt>(this.quality?.maxRepairCycles??2)){
      task.state='quality-hold';this.qualityStates.set(task.definition.id,'hold');
      this.record('quality-hold',0,`Quality hold · ${task.definition.label} · ${attempt} failed checks`,task.definition.id,[task.completionEventId!]);return;
    }
    const repairId=`${sourceId}/repair-${attempt}`,recheckId=`${sourceId}/recheck-${attempt+1}`;
    const subject=(this.taskById.get(sourceId)?.definition.label??task.definition.label)
      .replace(/^(Inspect|Verify|Integrated|Pre-paint|Ground|Post-flight|Customer)\s*/i,'');
    const repair:TaskDefinition=Object.freeze({id:repairId,label:`Repair · ${subject||task.definition.label}`,
      stationId:task.definition.stationId,prerequisites:Object.freeze([task.definition.id]),durationMs:4*3_600_000,
      finishWithinDay:task.definition.finishWithinDay,
      crewRequirements:Object.freeze({...check.repairCrewRequirements}),materialRequirements:Object.freeze({}),completionMilestones:Object.freeze([])});
    const recheck:TaskDefinition=Object.freeze({...task.definition,id:recheckId,label:`Reinspect · ${subject||task.definition.label}`,
      prerequisites:Object.freeze([repairId]),durationMs:2*3_600_000,materialRequirements:Object.freeze({}),
      qualityCheck:Object.freeze({...check,originalTaskId:sourceId,attempt:attempt+1})});
    this.tasks.push({definition:repair,state:'pending',remaining:repair.durationMs,startedAt:null,completedAt:null,startEventId:null,completionEventId:null,generation:0},
      {definition:recheck,state:'pending',remaining:recheck.durationMs,startedAt:null,completedAt:null,startEventId:null,completionEventId:null,generation:0});
    ids.add(recheckId);this.qualityStates.set(repairId,'repair');this.qualityStates.set(recheckId,'reinspection');
    for(const candidate of this.tasks){
      if(candidate.definition.qualityCheck||candidate.definition.id===repairId||candidate.definition.id===recheckId
        ||candidate.definition.id.startsWith(`${sourceId}/repair-`)||candidate.definition.id.startsWith(`${sourceId}/recheck-`))continue;
      if(candidate.definition.prerequisites.some(id=>ids.has(id))&&!candidate.definition.prerequisites.includes(recheckId))
        candidate.definition=Object.freeze({...candidate.definition,prerequisites:Object.freeze([...candidate.definition.prerequisites,recheckId])});
    }
    this.indexTasks();
    this.record('rework-scheduled',0,`Repair and reinspection scheduled · ${repair.label} · cycle ${attempt}`,task.definition.id,[task.completionEventId!]);
  }

  advanceTo(to: number) {
    if (!Number.isSafeInteger(to) || to < this.instant || to > this.definition.end) throw new RangeError('Advance must stay within the current run horizon.');
    while (this.queue.length && this.queue[0].instant <= to) {
      this.accrue(this.queue[0].instant);
      const due: QueuedEvent[] = [];
      while (this.queue[0]?.instant === this.instant) due.push(this.queue.shift()!);
      for (const event of due) {
        if (event.phase === 0) {
          const task = this.taskById.get(event.taskId!)!;
          if(task.state!=='running'||task.generation!==event.generation)continue;
          task.remaining = 0; task.state = 'complete'; task.completedAt = this.instant;
          task.completionEventId = this.record('task-completed', 0, event.label, event.taskId, [task.startEventId!]);
          this.resources?.release(task.definition,this.definition.serialId,this.instant,false,[task.completionEventId]);
          this.inspect(task);
        } else {
          const cause = this.record('calendar-boundary', 1, event.label);
          const current=calendarStateAt(this.definition.calendar,this.instant);
          const previous=calendarStateAt(this.definition.calendar,Math.max(this.definition.calendar.start,this.instant-1));
          const working=current.status==='working',shiftChanged=previous.shift!==current.shift;
          for (const task of this.tasks) if (task.startedAt !== null && task.state !== 'complete'&&task.state!=='quality-hold') {
            if (!working || (shiftChanged&&task.definition.durationMode!=='elapsed')) {
              if(task.definition.durationMode!=='elapsed'){
                task.generation++;task.state='paused-off-shift';
                const released=this.resources?.release(task.definition,this.definition.serialId,this.instant,
                  task.definition.holdEquipmentOffShift??false,[cause])??[];
                this.record('task-paused',1,task.definition.label,task.definition.id,[cause,...released]);
              }else this.resources?.release(task.definition,this.definition.serialId,this.instant,true,[cause]);
            }else if(shiftChanged&&task.definition.durationMode==='elapsed'){
              this.resources?.release(task.definition,this.definition.serialId,this.instant,true,[cause]);
            }else if(task.definition.durationMode==='elapsed'&&task.state!=='running'){
              task.state='running';
            }
          }
        }
      }
      this.dispatch();
      if (this.tasks.every(task => task.state === 'complete')) this.queue = [];
      else if (!this.queue.some(event => event.phase === 1)) this.queueBoundary();
    }
    this.accrue(to); this.publish(); return this.snapshot;
  }

  private publish() {
    const complete = this.tasks.every(task => task.state === 'complete');
    const status = complete ? 'complete' : this.instant === this.definition.end ? 'horizon-reached'
      : this.queue.length || this.tasks.some(task => task.state === 'running') ? 'active' : 'blocked';
    this.snapshot = Object.freeze({ runId: this.runId, revision: ++this.revision, instant: this.instant, status,
      aircraft: Object.freeze({ id: this.definition.serialId,
        completedMilestones: Object.freeze(this.tasks.filter(task => task.state === 'complete').flatMap(task => task.definition.completionMilestones)) }),
      tasks: Object.freeze(this.tasks.map(task => {
        const waitingFor=task.definition.prerequisites.filter(id=>this.taskById.get(id)!.state!=='complete');
        const materialBlockers=['pending','waiting-day-window','waiting-resource','paused-off-shift','paused-equipment'].includes(task.state)&&!waitingFor.length?this.materials?.missing(task.definition)??[]:[];
        const resourceBlockers=['waiting-resource','paused-equipment'].includes(task.state)&&!waitingFor.length?this.resources?.blockers(task.definition,this.instant)??[]:[];
        const calendarBlockers=task.state==='waiting-day-window'?[`Not enough working time left today · needs ${(task.remaining/3_600_000).toFixed(1)}h, available ${(workingTimeLeftToday(this.definition.calendar,this.instant)/3_600_000).toFixed(1)}h`]:[];
        return Object.freeze({taskId:task.definition.id,label:task.definition.label,
          state:materialBlockers.length?'waiting-material' as const:task.state,remainingWorkMs:task.remaining,startedAt:task.startedAt,completedAt:task.completedAt,
          waitingFor:Object.freeze(waitingFor),materialBlockers:Object.freeze([...materialBlockers]),resourceBlockers:Object.freeze([...resourceBlockers]),
          calendarBlockers:Object.freeze(calendarBlockers),
          qualityStatus:this.qualityStates.get(task.definition.id)});})),
      history: Object.freeze([...this.history]), nextEventInstant: this.queue[0]?.instant ?? null });
  }
}

/** One source of pilot state shared by calendar, actor and inspector; no render-loop scheduling. */
export class PilotSession {
  readonly engine: TaskEngine;
  readonly clock: SimulationClock;
  private run = 1;
  private listeners = new Set<() => void>();
  constructor(definition: PilotDefinition, now?: () => number) {
    this.engine = new TaskEngine(definition);
    this.clock = new SimulationClock(definition.start, definition.end, now);
    this.clock.subscribe(() => {
      const instant = this.clock.getSnapshot().instant;
      if (instant < this.engine.getSnapshot().instant) this.engine.reset(`pilot-${++this.run}`);
      this.engine.advanceTo(instant);
      this.listeners.forEach(listener => listener());
    });
  }
  getSnapshot = () => this.engine.getSnapshot();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  reset() { this.engine.reset(`pilot-${++this.run}`); this.clock.reset(); }
  nextEvent() {
    this.clock.setPlaying(false);
    const next = this.getSnapshot().nextEventInstant;
    if (next !== null) this.clock.seek(next);
  }
  nextOperation() {
    this.clock.setPlaying(false);
    const before = this.getSnapshot().history.length;
    // Skip calendar-only events, but process every one through the same engine.
    for (let count = 0; count < 2000 && this.getSnapshot().nextEventInstant !== null; count++) {
      this.nextEvent();
      if (this.getSnapshot().history.slice(before).some(event => event.kind === 'task-started' || event.kind === 'task-completed')) return;
    }
  }
  nextTowPhase() {
    this.clock.setPlaying(false);
    const snapshot=this.getSnapshot();
    const task=snapshot.tasks.find(task=>task.state==='running' && this.engine.definition.tasks.find(recipe=>recipe.id===task.taskId)?.kind==='transfer');
    if(!task || task.startedAt===null) return;
    const recipe=this.engine.definition.tasks.find(recipe=>recipe.id===task.taskId)!;
    const route=transfers[recipe.transferRouteId!];
    let elapsed=0;
    for(const phase of route.phases) {
      elapsed+=phase.durationMs;
      const next=task.startedAt+elapsed;
      if(next>snapshot.instant) {this.clock.seek(Math.min(next,this.engine.definition.end));return;}
    }
  }
}
