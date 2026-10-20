export type StationActionId = 'wing-crane' | 'engine-hoist' | 'paint-carriage';
export type StationWorkZone = 'bay-2' | 'bay-4' | 'paint';

export type StationActionDefinition = {
  id: StationActionId;
  label: string;
  zoneId: StationWorkZone;
  role: string;
  positionM: [number, number, number];
  sizeM: [number, number, number];
  cycleStartSeconds: number;
};

export type StationActionState = {
  id: StationActionId;
  phase: string;
  mode: string;
  active: boolean;
  progress: number;
  trolleyXM: number;
  toolYM: number;
  sprayActive: boolean;
  loadRotation: number;
};

export const STATION_CYCLE_SECONDS = 60;
export const STATION_ACTION_DURATION_SECONDS = 18;

export const stationActionDefinitions: StationActionDefinition[] = [
  { id: 'wing-crane', label: 'Wing positioning overhead crane', zoneId: 'bay-2', role: 'Wing fixture positioning',
    positionM: [-40, 0.7, -145], sizeM: [8, 5, 8], cycleStartSeconds: 0 },
  { id: 'engine-hoist', label: 'Engine alignment hoist', zoneId: 'bay-4', role: 'Engine handling',
    positionM: [-149, 0.7, 121], sizeM: [8, 8, 8], cycleStartSeconds: 20 },
  { id: 'paint-carriage', label: 'Paint booth traverse carriage', zoneId: 'paint', role: 'Enclosed finish pass',
    positionM: [104, 0.7, -30], sizeM: [8, 6, 8], cycleStartSeconds: 40 },
];

const smooth = (progress: number) => {
  const value = Math.max(0, Math.min(1, progress));
  return value * value * (3 - 2 * value);
};

function segment(elapsed: number, start: number, end: number) {
  return smooth((elapsed - start) / (end - start));
}

function stateFor(id: StationActionId, phase: string, mode: string, progress: number,
  trolleyXM: number, toolYM: number, sprayActive = false, loadRotation = 0): StationActionState {
  return { id, phase, mode, active: true, progress, trolleyXM, toolYM, sprayActive, loadRotation };
}

export function stationActionAt(id: string, elapsedSeconds: number): StationActionState | null {
  const definition = stationActionDefinitions.find(action => action.id === id);
  if (!definition) return null;
  const actionId = definition.id;
  const local = ((elapsedSeconds - definition.cycleStartSeconds) % STATION_CYCLE_SECONDS + STATION_CYCLE_SECONDS)
    % STATION_CYCLE_SECONDS;
  if (local >= STATION_ACTION_DURATION_SECONDS) {
    const [trolleyXM, toolYM] = id === 'wing-crane' ? [-26, 18.5]
      : id === 'engine-hoist' ? [4, 4.5] : [-30, 18.2];
    return { id: definition.id, phase: 'standby', mode: 'Ready · awaiting work cycle', active: false,
      progress: 0, trolleyXM, toolYM, sprayActive: false, loadRotation: 0 };
  }

  if (actionId === 'wing-crane') {
    if (local < 3) {
      const progress = segment(local, 0, 3);
      return stateFor(actionId, 'lowering', 'Lowering alignment yoke', progress, -26, 18.5 - progress * 5.5);
    }
    if (local < 10) {
      const progress = segment(local, 3, 10);
      return stateFor(actionId, 'traverse', 'Positioning wing fixture', progress, -26 + progress * 44, 13);
    }
    if (local < 14) {
      const progress = segment(local, 10, 14);
      return stateFor(actionId, 'aligning', 'Aligning wing station', progress, 18 - progress * 18, 13 + progress * 1.5);
    }
    const progress = segment(local, 14, 18);
    return stateFor(actionId, 'resetting', 'Returning yoke to standby', progress, -26 * progress, 14.5 + progress * 4);
  }

  if (actionId === 'engine-hoist') {
    if (local < 5) {
      const progress = segment(local, 0, 5);
      return stateFor(actionId, 'lifting', 'Lifting engine clear of its cradle', progress, 4, 4.5 + progress * 4.5,
        false, 0.025 * Math.sin(progress * Math.PI));
    }
    if (local < 12) {
      const progress = segment(local, 5, 12);
      return stateFor(actionId, 'aligning', 'Aligning engine over the handling stand', progress, 4 - progress * 4, 9,
        false, 0.025 * (1 - progress));
    }
    const progress = segment(local, 12, 18);
    return stateFor(actionId, 'resetting', 'Returning engine to its cradle', progress, progress * 4, 4.5);
  }

  if (local < 3) {
    const progress = segment(local, 0, 3);
    return stateFor(actionId, 'positioning', 'Positioning paint carriage', progress, -30, 18.2);
  }
  if (local < 14) {
    const progress = segment(local, 3, 14);
    return stateFor(actionId, 'spray-pass', 'Traversing enclosed finish pass', progress, -30 + progress * 60, 10.8, true);
  }
  const progress = segment(local, 14, 18);
  return stateFor(actionId, 'resetting', 'Returning carriage to standby', progress, 30 - progress * 60, 18.2);
}

export function stationWorkActiveForZone(zoneId: string, elapsedSeconds: number): boolean {
  return stationActionDefinitions.some(action => action.zoneId === zoneId
    && stationActionAt(action.id, elapsedSeconds)?.active === true);
}
