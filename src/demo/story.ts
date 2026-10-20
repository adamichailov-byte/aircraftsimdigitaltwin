import { aircraftEntities } from './entities.ts';
import type { AircraftVariant } from '../models/aircraft-parts.ts';

export const AIRCRAFT_STORY_ID = 'aircraft-join';
export const AIRCRAFT_STORY_DURATION_SECONDS = 720;
const STAGE_IDS = ['bay-1', 'bay-2', 'bay-3', 'bay-4', 'bay-5', 'bay-6', 'paint', 'flightline', 'delivery'];
const STAGE_LABELS = ['Fuselage join', 'Wing and tail join', 'Systems installation', 'Landing gear and engines',
  'Cabin installation', 'Ground checks and rework', 'Paint and finish', 'Flight-line acceptance', 'Delivery stand'];
const STAGE_VARIANTS: AircraftVariant[] = ['sectioned', 'bare', 'systems', 'engine-install', 'cabin', 'ready-for-paint',
  'paint', 'complete', 'complete'];
const WORK_SECONDS = [18, 18, 30, 18, 18, 18, 24, 18, 18];
export type AircraftStoryPose = {
  entityId: string;
  stageLabel: string;
  variant: AircraftVariant;
  zoneId: string;
  positionM: [number, number, number];
  heading: number;
  inTransit: boolean;
  mode: 'working' | 'waiting' | 'transit' | 'queue' | 'complete';
  motionMode?: 'forward' | 'reverse' | 'turn';
  waitingFor?: string;
  hiddenBackgroundIds: string[];
  transferStartSeconds?: number;
  transferEndSeconds?: number;
};

type Point = [number, number];
type Route = { path: Point[]; duration: number; reversePath?: Point[]; forwardPath?: Point[];
  reverseSeconds?: number; turnSeconds?: number };
type Move = { start: number; end: number; from: number; to: number; toSlot: number; path: Point[]; queueEntry: boolean;
  reversePath?: Point[]; forwardPath?: Point[]; reverseSeconds?: number; turnSeconds?: number };
type AircraftPlan = { id: string; initialStage: number; moves: Move[]; completeAt: number | null; queueIndex: number };

export const aircraftTransferRoutes = {
  bay3ToBay4: [[104, -145], [145, -145], [145, -240], [-222, -240], [-222, 85], [-184, 85]] as Point[],
  bay6ToPaint: [[104, 85], [130, 85], [180, 85], [225, 85], [260, 50], [260, -20],
    [230, -55], [190, -55], [148, -30], [104, -30]] as Point[],
  paintReverseOut: [[104, -30], [148, -30], [180, -30], [220, -30]] as Point[],
  paintTaxiToChecks: [[220, -30], [245, 0], [260, 70], [260, 145], [230, 195], [230, 280]] as Point[],
};

const routes: Route[] = [
  { path: [[-184, -145], [-40, -145]], duration: 9 },
  { path: [[-40, -145], [104, -145]], duration: 9 },
  { path: aircraftTransferRoutes.bay3ToBay4, duration: 40 },
  { path: [[-184, 85], [-40, 85]], duration: 9 },
  { path: [[-40, 85], [104, 85]], duration: 9 },
  { path: aircraftTransferRoutes.bay6ToPaint, duration: 38 },
  { path: [...aircraftTransferRoutes.paintReverseOut, ...aircraftTransferRoutes.paintTaxiToChecks.slice(1)], duration: 46,
    reversePath: aircraftTransferRoutes.paintReverseOut, forwardPath: aircraftTransferRoutes.paintTaxiToChecks,
    reverseSeconds: 12, turnSeconds: 4 },
  { path: [[230, 280], [300, 280], [365, 280], [420, 280]], duration: 14 },
];
const deliveryExitDuration = 14;
const queuePositions: Point[] = [[-184, -55], [-100, -55], [-16, -55]];
const initialIdsByStage = [
  'aircraft-join', 'aircraft-wing-tail', 'aircraft-systems', 'aircraft-gear-engines', 'aircraft-cabin',
  'aircraft-ground-check', 'aircraft-paint', 'aircraft-delivery-02', 'aircraft-delivery',
];

function pointOnPath(path: Point[], progress: number) {
  const lengths = path.slice(1).map(([x, z], index) => Math.hypot(x - path[index][0], z - path[index][1]));
  const totalLength = lengths.reduce((total, length) => total + length, 0);
  let remaining = totalLength * Math.max(0, Math.min(1, progress));
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length || index === lengths.length - 1) {
      const start = path[index];
      const end = path[index + 1];
      const segmentProgress = length ? remaining / length : 1;
      return { xM: start[0] + (end[0] - start[0]) * segmentProgress,
        zM: start[1] + (end[1] - start[1]) * segmentProgress,
        heading: Math.atan2(-(end[1] - start[1]), end[0] - start[0]) };
    }
    remaining -= length;
  }
  return { xM: path.at(-1)![0], zM: path.at(-1)![1], heading: 0 };
}

function normalizedAngle(start: number, end: number, progress: number) {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * progress;
}

function pointOnMove(move: Move, elapsed: number) {
  if (!move.reversePath || !move.forwardPath) {
    const point = pointOnPath(move.path, (elapsed - move.start) / (move.end - move.start));
    return { ...point, motionMode: 'forward' as const };
  }
  const reverseSeconds = move.reverseSeconds ?? 0;
  const turnSeconds = move.turnSeconds ?? 0;
  const forwardSeconds = move.end - move.start - reverseSeconds - turnSeconds;
  const local = elapsed - move.start;
  if (local < reverseSeconds) {
    const point = pointOnPath(move.reversePath, local / reverseSeconds);
    return { ...point, heading: point.heading + Math.PI, motionMode: 'reverse' as const };
  }
  const reverseEnd = pointOnPath(move.reversePath, 1);
  const forwardStart = pointOnPath(move.forwardPath, 0);
  if (local < reverseSeconds + turnSeconds) {
    const progress = (local - reverseSeconds) / turnSeconds;
    return { ...reverseEnd, heading: normalizedAngle(reverseEnd.heading + Math.PI, forwardStart.heading, progress),
      motionMode: 'turn' as const };
  }
  const point = pointOnPath(move.forwardPath, (local - reverseSeconds - turnSeconds) / forwardSeconds);
  return { ...point, motionMode: 'forward' as const };
}

function createPlans(): AircraftPlan[] {
  const plans: AircraftPlan[] = initialIdsByStage.map((id, stage) => ({
    id, initialStage: stage, moves: [], completeAt: null, queueIndex: -1,
  }));
  aircraftEntities.filter(aircraft => aircraft.id.startsWith('aircraft-queue-')).forEach((aircraft, index) => {
    plans.push({ id: aircraft.id, initialStage: -1, moves: [], completeAt: null, queueIndex: index });
  });

  const occupancy: Array<string | null>[] = STAGE_IDS.map((_, stage) => stage === 8 ? [null, null] : [null]);
  const reserved = new Set<string>();
  const runtime = new Map<string, { stage: number; slot: number; workEnd: number; moving?: Move; done: boolean }>();
  for (const plan of plans) {
    if (plan.initialStage < 0) continue;
    occupancy[plan.initialStage][0] = plan.id;
    runtime.set(plan.id, { stage: plan.initialStage, slot: 0, workEnd: WORK_SECONDS[plan.initialStage], done: false });
  }
  const queued = plans.filter(plan => plan.initialStage < 0);
  let now = 0;

  while (now <= AIRCRAFT_STORY_DURATION_SECONDS) {
    const arrivals = [...runtime.entries()].filter(([, actor]) => actor.moving && actor.moving.end <= now)
      .sort((a, b) => b[1].stage - a[1].stage);
    for (const [id, actor] of arrivals) {
      const move = actor.moving!;
      if (actor.stage >= 0) occupancy[actor.stage][occupancy[actor.stage].indexOf(id)] = null;
      reserved.delete(id);
      actor.moving = undefined;
      if (move.to < 0) {
        actor.done = true;
        actor.stage = -2;
        continue;
      }
      occupancy[move.to][move.toSlot] = id;
      reserved.delete(`${move.to}:${move.toSlot}`);
      actor.stage = move.to;
      actor.slot = move.toSlot;
      actor.workEnd = now + WORK_SECONDS[move.to];
    }

    const ready = [...runtime.entries()].filter(([, actor]) => !actor.moving && !actor.done
      && actor.stage >= 0 && actor.workEnd <= now && actor.stage <= 8)
      .sort((a, b) => b[1].stage - a[1].stage);
    for (const [id, actor] of ready) {
      if (actor.stage === 8) {
        const route = { path: [stagePoint(8, actor.slot), [470, 280], [520, 280]] as Point[], duration: deliveryExitDuration };
        const move: Move = { start: now, end: now + route.duration, from: 8, to: -1, toSlot: -1,
          path: route.path, queueEntry: false };
        planFor(id).moves.push(move);
        actor.moving = move;
        continue;
      }
      const target = actor.stage + 1;
      const freeSlot = occupancy[target].findIndex((occupant, index) => occupant === null && !reserved.has(`${target}:${index}`));
      if (freeSlot < 0) continue;
      const baseRoute = routes[actor.stage];
      const route = target === 8 && freeSlot === 1
        ? { path: [[230, 280], [300, 280], [360, 320], [420, 370]] as Point[], duration: baseRoute.duration }
        : baseRoute;
      const move: Move = { start: now, end: now + route.duration, from: actor.stage, to: target, toSlot: freeSlot,
        path: route.path, queueEntry: false, reversePath: route.reversePath, forwardPath: route.forwardPath,
        reverseSeconds: route.reverseSeconds, turnSeconds: route.turnSeconds };
      planFor(id).moves.push(move);
      actor.moving = move;
      reserved.add(`${target}:${freeSlot}`);
    }

    const queueActor = queued.find(plan => !runtime.has(plan.id));
    if (queueActor && occupancy[0].every(Boolean) && !reserved.has('0:0')) {
      // The queue feeds the line when Bay 01 is clear; a reservation holds the bay during entry.
    } else if (queueActor) {
      const slot = occupancy[0].findIndex(occupant => occupant === null);
      if (slot >= 0 && !reserved.has(`0:${slot}`)) {
        const move: Move = { start: now, end: now + 9, from: -1, to: 0, toSlot: slot,
          path: [queuePositions[queueActor.queueIndex], [-184, -145]], queueEntry: true };
        queueActor.moves.push(move);
        runtime.set(queueActor.id, { stage: -1, slot: 0, workEnd: now, moving: move, done: false });
        reserved.add(`0:${slot}`);
        queued.splice(queued.indexOf(queueActor), 1);
      }
    }

    const nextTimes = [...runtime.values()].flatMap(actor => [
      actor.moving?.end,
      !actor.done && !actor.moving && actor.stage >= 0 && actor.stage < 8 && actor.workEnd > now ? actor.workEnd : undefined,
      !actor.done && !actor.moving && actor.stage === 8 && actor.workEnd > now ? actor.workEnd : undefined,
    ]).filter((value): value is number => value !== undefined && value > now);
    const next = Math.min(...nextTimes);
    if (!Number.isFinite(next)) break;
    now = next;
  }

  return plans;

  function planFor(id: string) { return plans.find(plan => plan.id === id)!; }
}

const aircraftPlans = createPlans();
export const aircraftStoryIds = aircraftPlans.map(plan => plan.id);

function poseFor(plan: AircraftPlan, seconds: number): AircraftStoryPose {
  const entity = aircraftEntities.find(aircraft => aircraft.id === plan.id)!;
  const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.min(AIRCRAFT_STORY_DURATION_SECONDS, seconds)) : 0;
  let stage = plan.initialStage;
  let slot = 0;
  let mode: AircraftStoryPose['mode'] = stage < 0 ? 'queue' : 'working';
  let motionMode: AircraftStoryPose['motionMode'];
  let variant = stage < 0 ? 'sectioned' : STAGE_VARIANTS[stage];
  let position: Point = stage < 0 ? queuePositions[plan.queueIndex] : stagePoint(stage, slot);
  let heading = 0;
  let zoneId = stage < 0 ? 'receiving' : STAGE_IDS[stage];
  let stageStart = 0;
  let waitingFor: string | undefined;
  let activeMove: Move | undefined;

  for (const move of plan.moves) {
    if (elapsed < move.start) {
      stage = move.from;
      if (stage >= 0) {
        position = stagePoint(stage, slot);
        zoneId = STAGE_IDS[stage];
        const prior = [...plan.moves].reverse().find(candidate => candidate.to === stage && candidate.end <= move.start);
        stageStart = prior?.end ?? 0;
        variant = STAGE_VARIANTS[stage];
        mode = elapsed < stageStart + WORK_SECONDS[stage] ? 'working' : 'waiting';
        if (mode === 'waiting') waitingFor = stage < 6 ? `Bay ${String(stage + 2).padStart(2, '0')}`
          : stage === 6 ? 'Flight-line checks' : stage === 7 ? 'Delivery stands' : undefined;
      }
      break;
    }
    if (elapsed < move.end) {
      activeMove = move;
      const point = pointOnMove(move, elapsed);
      position = [point.xM, point.zM];
      heading = point.heading;
      motionMode = point.motionMode;
      mode = 'transit';
      stage = move.from;
      const progress = (elapsed - move.start) / (move.end - move.start);
      zoneId = progress < 0.5 ? (stage < 0 ? 'receiving' : STAGE_IDS[stage]) : move.to >= 0 ? STAGE_IDS[move.to] : 'offsite';
      break;
    }
    stage = move.to;
    slot = move.toSlot < 0 ? slot : move.toSlot;
    if (stage < 0) {
      mode = 'complete';
      zoneId = 'offsite';
      position = [520, 280];
      break;
    }
    position = stagePoint(stage, slot);
    zoneId = STAGE_IDS[stage];
    stageStart = move.end;
    variant = STAGE_VARIANTS[stage];
    mode = stage === 8 && elapsed >= stageStart + WORK_SECONDS[stage] ? 'complete' : 'working';
  }

  if (stage < 0 && mode !== 'transit') {
    const queueMove = plan.moves[0];
    if (!queueMove) {
      position = queuePositions[plan.queueIndex];
      mode = 'queue';
    }
  }
  if (stage === 8 && elapsed >= stageStart + WORK_SECONDS[8]) mode = 'complete';
  if (plan.completeAt !== null && elapsed >= plan.completeAt) mode = 'complete';
  return {
    entityId: entity.id, stageLabel: stage < 0 ? 'Queued for Bay 01'
      : mode === 'waiting' ? `Waiting for ${waitingFor}` : STAGE_LABELS[Math.min(stage, STAGE_LABELS.length - 1)],
    variant, zoneId, positionM: [position[0], 0.7, position[1]], heading, inTransit: mode === 'transit', mode,
    motionMode, waitingFor, hiddenBackgroundIds: [], transferStartSeconds: activeMove?.start, transferEndSeconds: activeMove?.end,
  };
}

function entityAtStage(stage: number) {
  return aircraftEntities.find(aircraft => aircraft.id === initialIdsByStage[stage])!;
}

function stagePoint(stage: number, slot: number): Point {
  if (stage === 8) return slot === 0 ? [420, 280] : [420, 370];
  const entity = entityAtStage(stage);
  return [entity.positionM[0], entity.positionM[2]];
}

export function storyFleetAt(seconds: number): AircraftStoryPose[] {
  return aircraftPlans.map(plan => poseFor(plan, seconds));
}

export function storyAt(seconds: number, entityId = AIRCRAFT_STORY_ID): AircraftStoryPose {
  const plan = aircraftPlans.find(candidate => candidate.id === entityId);
  if (plan) return poseFor(plan, seconds);
  const entity = aircraftEntities.find(aircraft => aircraft.id === entityId)!;
  return { entityId, stageLabel: entity.label, variant: entity.variant, zoneId: entity.zoneId,
    positionM: entity.positionM, heading: entity.rotationY ?? 0, inTransit: false, mode: 'working', hiddenBackgroundIds: [] };
}

export function storyMachineTimeAt(seconds: number): number {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const moves = aircraftPlans.find(plan => plan.id === AIRCRAFT_STORY_ID)?.moves ?? [];
  return Math.max(0, elapsed - moves.reduce((total, move) =>
    total + Math.max(0, Math.min(elapsed, move.end) - move.start), 0));
}
