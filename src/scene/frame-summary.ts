export type FrameSummary = { frames: number; seconds: number; fps: number; p95Ms: number; worstMs: number };

/** Each value is one complete frame interval; idle gaps are excluded by the caller. */
export function summarizeFrames(intervalsMs: readonly number[]): FrameSummary {
  const intervals = intervalsMs.filter(value => Number.isFinite(value) && value > 0);
  const duration = intervals.reduce((sum, value) => sum + value, 0);
  const sorted = [...intervals].sort((a, b) => a - b);
  return {
    frames: intervals.length, seconds: duration / 1000,
    fps: duration ? intervals.length * 1000 / duration : 0,
    p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
    worstMs: sorted.at(-1) ?? 0,
  };
}
