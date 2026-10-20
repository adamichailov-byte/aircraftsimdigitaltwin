import type { PlantCalendar } from './types.ts';

export type TaskDefinition = {
  readonly id: string; readonly label: string; readonly prerequisites: readonly string[];
  readonly durationMs: number; // productive working milliseconds with a fixed crew
  readonly stationId?: string;
  readonly durationMode?: 'working' | 'elapsed';
  readonly startPolicy?: 'working' | 'anytime';
  /** Start only when the remaining staffed time on this local date covers the whole job. */
  readonly finishWithinDay?: boolean;
  readonly kind?: 'work' | 'transfer' | 'offsite';
  readonly transferRouteId?: string;
  readonly equipmentRequirements?: Readonly<Record<string, number>>;
  /** Elapsed tasks may keep exclusive equipment across an off-shift pause. Crew is always released. */
  readonly holdEquipmentOffShift?: boolean;
  readonly crewRequirements: Readonly<Record<string, number>>;
  readonly materialRequirements: Readonly<Record<string, number>>;
  readonly completionMilestones: readonly string[];
  readonly qualityCheck?:{readonly repairCrewRequirements:Readonly<Record<string,number>>;
    readonly originalTaskId?:string;readonly attempt?:number};
};
export type PilotDefinition = {
  readonly calendar: PlantCalendar; readonly start: number; readonly end: number;
  readonly serialId: string; readonly tasks: readonly TaskDefinition[];
  readonly availability: 'assumed-abundant';
};
export type TaskState = 'pending' | 'waiting-day-window' | 'waiting-material' | 'waiting-resource' | 'running' | 'paused-off-shift' | 'paused-equipment' | 'quality-hold' | 'complete';
export type TaskMaterials={issue:(task:TaskDefinition,instant:number)=>readonly string[]|null;
  missing:(task:TaskDefinition)=>readonly string[]};
export type TaskResources={blockers:(task:TaskDefinition,instant:number)=>readonly string[];
  canEverAcquire:(task:TaskDefinition)=>boolean;acquire:(task:TaskDefinition,serialId:string,instant:number)=>string|null;
  release:(task:TaskDefinition,serialId:string,instant:number,keepEquipment:boolean,causes:readonly string[])=>readonly string[];
  outageBlockers?:(task:TaskDefinition,instant:number)=>readonly string[]};
export type TaskSnapshot = {
  readonly taskId: string; readonly label: string; readonly state: TaskState;
  readonly remainingWorkMs: number; readonly startedAt: number | null; readonly completedAt: number | null;
  readonly waitingFor: readonly string[];
  readonly materialBlockers?: readonly string[];
  readonly resourceBlockers?: readonly string[];
  readonly calendarBlockers?: readonly string[];
  readonly qualityStatus?:'failed'|'passed'|'repair'|'reinspection'|'hold';
};
export type TaskEvent = {
  readonly id: string; readonly runId: string; readonly sequence: number; readonly instant: number;
  readonly phase: 0 | 1 | 2;
  readonly kind: 'task-started' | 'task-completed' | 'calendar-boundary' | 'task-paused' | 'task-resumed'
    | 'task-deferred' | 'task-ready'
    |'equipment-outage-started'|'equipment-outage-ended'|'inspection-passed'|'inspection-failed'|'rework-scheduled'|'quality-hold';
  readonly entityIds: readonly string[]; readonly causeEventIds: readonly string[]; readonly payloadVersion: 1;
  readonly payload: Readonly<{ taskId?: string; label: string }>;
};
export type PilotSnapshot = {
  readonly runId: string; readonly revision: number; readonly instant: number;
  readonly status: 'active' | 'complete' | 'blocked' | 'horizon-reached';
  readonly aircraft: Readonly<{ id: string; completedMilestones: readonly string[] }>;
  readonly tasks: readonly TaskSnapshot[]; readonly history: readonly TaskEvent[];
  readonly nextEventInstant: number | null;
};

export function validateRecipe(tasks: readonly TaskDefinition[]) {
  if (tasks.length > 100) throw new RangeError('Pilot recipe exceeds 100 tasks.');
  const byId = new Map(tasks.map(task => [task.id, task]));
  if (byId.size !== tasks.length) throw new RangeError('Duplicate task IDs.');
  for (const task of tasks) {
    if (!task.id || !task.label || !Number.isSafeInteger(task.durationMs) || task.durationMs <= 0) {
      throw new RangeError('Every task needs an ID, label and positive integer working duration.');
    }
    if (new Set(task.prerequisites).size !== task.prerequisites.length || task.prerequisites.some(id => !byId.has(id))) {
      throw new RangeError(`Invalid prerequisite for ${task.id}.`);
    }
    if ((task.durationMode && !['working', 'elapsed'].includes(task.durationMode))
      || (task.startPolicy && !['working', 'anytime'].includes(task.startPolicy))
      || (task.startPolicy === 'anytime' && task.durationMode !== 'elapsed')) throw new RangeError('Invalid task time policy.');
    if (task.finishWithinDay !== undefined && (typeof task.finishWithinDay !== 'boolean'
      || (task.finishWithinDay && (task.durationMode === 'elapsed' || task.startPolicy === 'anytime')))) {
      throw new RangeError('Same-day jobs must use staffed working time.');
    }
    if ([...Object.values(task.crewRequirements), ...Object.values(task.materialRequirements), ...Object.values(task.equipmentRequirements ?? {}),
      ...Object.values(task.qualityCheck?.repairCrewRequirements??{})]
      .some(quantity => !Number.isSafeInteger(quantity) || quantity <= 0)) throw new RangeError('Invalid task requirement quantity.');
  }
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new RangeError(`Cyclic task recipe at ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    byId.get(id)!.prerequisites.forEach(visit);
    visiting.delete(id); visited.add(id);
  }
  tasks.forEach(task => visit(task.id));
}
