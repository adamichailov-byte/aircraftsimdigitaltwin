export type PlaybackSpeed = 0.5 | 1 | 2;

export type ClockSnapshot = {
  playing: boolean;
  speed: PlaybackSpeed;
  revision: number;
};

export class DemoClock {
  private elapsed = 0;
  private snapshot: ClockSnapshot;
  private listeners = new Set<() => void>();

  constructor(reducedMotion = false) {
    this.snapshot = { playing: !reducedMotion, speed: 1, revision: 0 };
  }

  getSnapshot = (): ClockSnapshot => this.snapshot;
  getElapsedSeconds = (): number => this.elapsed;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(next: ClockSnapshot) {
    if (next.playing === this.snapshot.playing && next.speed === this.snapshot.speed) return;
    this.snapshot = { ...next, revision: this.snapshot.revision + 1 };
    this.listeners.forEach(listener => listener());
  }

  setPlaying(playing: boolean) {
    this.update({ ...this.snapshot, playing });
  }

  togglePlaying() {
    this.setPlaying(!this.snapshot.playing);
  }

  setSpeed(speed: PlaybackSpeed) {
    this.update({ ...this.snapshot, speed });
  }

  reset() {
    this.elapsed = 0;
    this.update({ ...this.snapshot });
  }

  seek(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    this.elapsed = Math.max(0, seconds);
    this.snapshot = { ...this.snapshot, revision: this.snapshot.revision + 1 };
    this.listeners.forEach(listener => listener());
  }

  advance(deltaSeconds: number) {
    if (this.snapshot.playing && Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      this.elapsed += Math.min(deltaSeconds, 0.1) * this.snapshot.speed;
    }
  }
}

const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const demoClock = new DemoClock(reducedMotion);

export function bindClockToDocument(clock: DemoClock) {
  const pauseWhenHidden = () => {
    if (document.visibilityState === 'hidden') clock.setPlaying(false);
  };
  document.addEventListener('visibilitychange', pauseWhenHidden);
  return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
}
