import type { SimulationClockSnapshot } from './types.ts';

export const simulationSpeeds = [60_000, 3_600_000, 86_400_000] as const;

/** Monotonic wall-time anchors, not graphics deltas. Timer frequency affects display only. */
export class SimulationClock {
  private snapshot: SimulationClockSnapshot;
  private listeners = new Set<() => void>();
  private anchorWall = 0;
  private anchorInstant: number;
  private readonly start: number;
  private readonly end: number;
  private readonly now: () => number;

  constructor(start: number, end: number, now: () => number = () => performance.now()) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) throw new RangeError('Invalid clock horizon.');
    this.start = start; this.end = end; this.now = now; this.anchorInstant = start;
    this.snapshot = { instant: start, playing: false, speed: 3_600_000, revision: 0 };
  }

  getSnapshot = () => this.snapshot;
  /** Read-only interpolation for graphics; never dispatches operational events. */
  getInstant = () => this.currentInstant();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private currentInstant() {
    return this.snapshot.playing
      ? Math.min(this.end, this.anchorInstant + Math.floor(Math.max(0, this.now() - this.anchorWall) * this.snapshot.speed / 1000))
      : this.snapshot.instant;
  }

  private publish(next: Omit<SimulationClockSnapshot, 'revision'>) {
    this.snapshot = { ...next, revision: this.snapshot.revision + 1 };
    this.listeners.forEach(listener => listener());
  }

  tick() {
    const instant = this.currentInstant();
    if (instant !== this.snapshot.instant) this.publish({ ...this.snapshot, instant, playing: instant < this.end && this.snapshot.playing });
  }

  setPlaying(playing: boolean) {
    const instant = this.currentInstant();
    this.anchorInstant = instant; this.anchorWall = this.now();
    this.publish({ ...this.snapshot, instant, playing: playing && instant < this.end });
  }

  setSpeed(speed: number) {
    if (!(simulationSpeeds as readonly number[]).includes(speed)) throw new RangeError('Unsupported simulated-time speed.');
    const instant = this.currentInstant();
    this.anchorInstant = instant; this.anchorWall = this.now();
    this.publish({ ...this.snapshot, instant, speed, playing: this.snapshot.playing && instant < this.end });
  }

  seek(instant: number) {
    if (!Number.isSafeInteger(instant) || instant < this.start || instant > this.end) throw new RangeError('Invalid clock instant.');
    this.anchorInstant = instant; this.anchorWall = this.now();
    this.publish({ ...this.snapshot, instant, playing: false });
  }

  reset() { this.seek(this.start); }
}

export function bindSimulationClock(clock: SimulationClock, doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> = document) {
  const onVisibility = () => { if (doc.hidden) clock.setPlaying(false); };
  const timer = globalThis.setInterval(() => clock.tick(), 100);
  doc.addEventListener('visibilitychange', onVisibility);
  onVisibility();
  return () => { globalThis.clearInterval(timer); doc.removeEventListener('visibilitychange', onVisibility); };
}
