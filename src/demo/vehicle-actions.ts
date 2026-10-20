import { siteRoutes, type RoutePointM, type SiteRoute } from './routes.ts';

type Position3M = [xM: number, yM: number, zM: number];
export type MotionPhase = 'waiting' | 'moving' | 'working' | 'yielding' | 'complete';

// Keeps the complete, authored materials loop short enough to watch in one demo.
export const MATERIAL_TIME_COMPRESSION = 6;

export type VehicleAction = {
  entityId: string;
  pointsM: RoutePointM[];
  clearWidthM: number;
  speedMps: number;
  startDelaySeconds: number;
  dwellSecondsByPoint: Record<number, number>;
  yieldPointIndices: number[];
  pickupPointIndex?: number;
  dropPointIndex?: number;
  payloadStartM?: Position3M;
  payloadDropM?: Position3M;
  carryOffsetM?: [xM: number, yM: number, zM: number];
};

export type VehiclePose = {
  positionM: RoutePointM;
  heading: number;
  phase: MotionPhase;
  carrying: boolean;
  delivered: boolean;
};

function route(id: string): SiteRoute {
  const result = siteRoutes.find(candidate => candidate.id === id);
  if (!result) throw new Error(`Missing authored route: ${id}`);
  return result;
}

function roundTrip(pointsM: RoutePointM[]): RoutePointM[] {
  return [...pointsM, ...pointsM.slice(0, -1).reverse()];
}

const truckRoute = route('supplier-truck-dock');
const forkliftRoute = route('forklift-pallet-run');
const tugRoute = route('receiving-to-assembly');
const wingRoute = route('wing-dolly-transfer');
const engineRoute = route('engine-dolly-transfer');

export const motionPlans: VehicleAction[] = [
  {
    entityId: 'inbound-train',
    pointsM: [[-70, -345], [-365, -345]],
    clearWidthM: 14,
    speedMps: 7.5,
    startDelaySeconds: 6,
    dwellSecondsByPoint: { 1: 35 },
    yieldPointIndices: [],
  },
  {
    entityId: 'road-delivery-truck',
    pointsM: roundTrip(truckRoute.pointsM),
    clearWidthM: truckRoute.clearWidthM,
    speedMps: 9.5,
    startDelaySeconds: 0,
    dwellSecondsByPoint: { 2: 12 },
    yieldPointIndices: [],
  },
  {
    entityId: 'rail-forklift',
    pointsM: forkliftRoute.pointsM,
    clearWidthM: forkliftRoute.clearWidthM,
    speedMps: 8,
    startDelaySeconds: 80,
    dwellSecondsByPoint: { 1: 8, 6: 8, 7: 12, 13: 8 },
    yieldPointIndices: [1, 13],
    pickupPointIndex: 6,
    dropPointIndex: 7,
    payloadStartM: [-339, 0.7, -84],
    payloadDropM: [-408, 0.7, -28],
    carryOffsetM: [2.3, 0.48, 0],
  },
  {
    entityId: 'receiving-wing-stand',
    pointsM: wingRoute.pointsM,
    clearWidthM: wingRoute.clearWidthM,
    speedMps: 4.4,
    startDelaySeconds: 270,
    dwellSecondsByPoint: { 0: 8, 2: 12, 4: 8 },
    yieldPointIndices: [],
  },
  {
    entityId: 'receiving-engine-stand',
    pointsM: engineRoute.pointsM,
    clearWidthM: engineRoute.clearWidthM,
    speedMps: 5,
    startDelaySeconds: 335,
    dwellSecondsByPoint: { 0: 6, 2: 8, 4: 6 },
    yieldPointIndices: [],
  },
  {
    entityId: 'material-tug',
    pointsM: roundTrip(tugRoute.pointsM),
    clearWidthM: tugRoute.clearWidthM,
    speedMps: 8,
    startDelaySeconds: 385,
    dwellSecondsByPoint: { 0: 8, 5: 12 },
    yieldPointIndices: [],
    pickupPointIndex: 0,
    dropPointIndex: 5,
    payloadStartM: [-435, 0.7, -30],
    payloadDropM: [-184, 0.7, -83],
    carryOffsetM: [-6, 0, 0],
  },
];

const beltPathM: Position3M[] = [
  [311, 5.8, -331],
  [312, 4.9, -328],
  [312, 3.5, -323],
  [312, 2.2, -318],
  [312, 1.7, -313],
];
const beltStartSeconds = 6;
const beltSpeedMps = 0.65;

function routeLength(pointsM: RoutePointM[]): number {
  return pointsM.slice(1).reduce((total, point, index) => {
    const previous = pointsM[index];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
}

function pathLength3D(pointsM: Position3M[]): number {
  return pointsM.slice(1).reduce((total, point, index) => {
    const previous = pointsM[index];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]);
  }, 0);
}

export function vehicleActionDurationSeconds(action: VehicleAction): number {
  const travel = routeLength(action.pointsM) / action.speedMps;
  const dwell = Object.values(action.dwellSecondsByPoint).reduce((total, seconds) => total + seconds, 0);
  return action.startDelaySeconds + travel + dwell;
}

export function actionTimeAtPoint(action: VehicleAction, pointIndex: number,
  moment: 'arrival' | 'departure' = 'arrival'): number {
  let seconds = action.startDelaySeconds;
  if (pointIndex > 0 || moment === 'departure') seconds += action.dwellSecondsByPoint[0] ?? 0;
  for (let index = 1; index <= pointIndex; index += 1) {
    const previous = action.pointsM[index - 1];
    const point = action.pointsM[index];
    seconds += Math.hypot(point[0] - previous[0], point[1] - previous[1]) / action.speedMps;
    if (index < pointIndex || moment === 'departure') seconds += action.dwellSecondsByPoint[index] ?? 0;
  }
  return seconds;
}

export function vehicleActionAt(action: VehicleAction, elapsedSeconds: number): VehiclePose {
  const first = action.pointsM[0];
  const time = Math.max(0, elapsedSeconds);
  const firstNext = action.pointsM[1];
  const initialHeading = Math.atan2(-(firstNext[1] - first[1]), firstNext[0] - first[0]);
  if (time < action.startDelaySeconds) {
    return { positionM: first, heading: initialHeading, phase: 'waiting', carrying: false, delivered: false };
  }

  let remaining = time - action.startDelaySeconds;
  let carrying = false;
  let delivered = false;
  let positionM = first;
  let heading = initialHeading;

  for (let index = 0; index < action.pointsM.length; index += 1) {
    positionM = action.pointsM[index];
    const dwell = action.dwellSecondsByPoint[index] ?? 0;
    if (remaining + 1e-9 < dwell) {
      const phase: MotionPhase = action.yieldPointIndices.includes(index) ? 'yielding' : 'working';
      return { positionM, heading, phase, carrying, delivered };
    }
    remaining -= dwell;
    if (index === action.pickupPointIndex) carrying = true;
    if (index === action.dropPointIndex) { carrying = false; delivered = true; }
    if (index === action.pointsM.length - 1) break;

    const next = action.pointsM[index + 1];
    const dx = next[0] - positionM[0];
    const dz = next[1] - positionM[1];
    const lengthM = Math.hypot(dx, dz);
    const travelSeconds = lengthM / action.speedMps;
    heading = Math.atan2(-dz, dx);
    if (remaining + 1e-9 < travelSeconds) {
      const progress = travelSeconds === 0 ? 1 : remaining / travelSeconds;
      return {
        positionM: [positionM[0] + dx * progress, positionM[1] + dz * progress],
        heading,
        phase: 'moving',
        carrying,
        delivered,
      };
    }
    remaining -= travelSeconds;
  }

  return { positionM, heading, phase: 'complete', carrying, delivered };
}

export function vehiclePayloadPoseAt(action: VehicleAction, pose: VehiclePose, baseY = 0.7): Position3M | null {
  if (!action.payloadStartM || !action.payloadDropM) return null;
  if (pose.delivered) return action.payloadDropM;
  if (!pose.carrying || !action.carryOffsetM) return action.payloadStartM;
  const [offsetX, offsetY, offsetZ] = action.carryOffsetM;
  const cosine = Math.cos(pose.heading);
  const sine = Math.sin(pose.heading);
  return [
    pose.positionM[0] + offsetX * cosine + offsetZ * sine,
    baseY + offsetY,
    pose.positionM[1] - offsetX * sine + offsetZ * cosine,
  ];
}

export type CargoUnloadingPose = { xM: number; yM: number; zM: number; heading: number; phase: 'waiting' | 'moving' | 'delivered' };

export function cargoUnloadingDurationSeconds(): number {
  return beltStartSeconds + pathLength3D(beltPathM) / beltSpeedMps;
}

export function cargoUnloadingPoseAt(elapsedSeconds: number): CargoUnloadingPose {
  const first = beltPathM[0];
  const last = beltPathM.at(-1)!;
  const elapsed = Math.max(0, elapsedSeconds);
  if (elapsed < beltStartSeconds) {
    return { xM: first[0], yM: first[1], zM: first[2], heading: 0, phase: 'waiting' };
  }
  let remaining = elapsed - beltStartSeconds;
  for (let index = 0; index < beltPathM.length - 1; index += 1) {
    const start = beltPathM[index];
    const end = beltPathM[index + 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const lengthM = Math.hypot(dx, dy, dz);
    const travelSeconds = lengthM / beltSpeedMps;
    if (remaining < travelSeconds) {
      const progress = remaining / travelSeconds;
      return { xM: start[0] + dx * progress, yM: start[1] + dy * progress,
        zM: start[2] + dz * progress, heading: Math.atan2(-dz, dx), phase: 'moving' };
    }
    remaining -= travelSeconds;
  }
  return { xM: last[0], yM: last[1], zM: last[2], heading: 0, phase: 'delivered' };
}
