/** UTC epoch milliseconds. Local date/time strings are converted at the boundary. */
export type InstantMs = number;
export type MinuteInterval = { readonly startMinute: number; readonly endMinute: number };
export type ShiftDefinition = MinuteInterval & {
  readonly label: string;
  readonly weekdays: readonly number[]; // ISO: Monday1 … Sunday7
  readonly breaks: readonly MinuteInterval[];
};
export type CalendarDefinition = {
  readonly timeZone: string;
  readonly shifts: readonly ShiftDefinition[];
  readonly excludedDates: readonly string[];
};
export type TimeInterval = { readonly start: InstantMs; readonly end: InstantMs };
export type CalendarBoundary = { readonly instant: InstantMs; readonly label: string };
export type PlantCalendar = TimeInterval & {
  readonly timeZone: string;
  readonly shifts: readonly (TimeInterval & { readonly label: string })[];
  readonly working: readonly TimeInterval[];
  readonly boundaries: readonly CalendarBoundary[];
};
export type SimulationClockSnapshot = {
  readonly instant: InstantMs;
  readonly playing: boolean;
  /** Simulated milliseconds per real second. */
  readonly speed: number;
  readonly revision: number;
};
