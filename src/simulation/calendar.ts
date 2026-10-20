import { Temporal } from '@js-temporal/polyfill';
import type { CalendarDefinition, MinuteInterval, PlantCalendar, TimeInterval } from './types.ts';

export const defaultCalendar: CalendarDefinition = {
  timeZone: 'America/New_York', excludedDates: [],
  shifts: [
    { label: 'Shift 1', weekdays: [1, 2, 3, 4, 5], startMinute: 360, endMinute: 840,
      breaks: [{ startMinute: 600, endMinute: 630 }] },
    { label: 'Shift 2', weekdays: [1, 2, 3, 4, 5], startMinute: 840, endMinute: 1320,
      breaks: [{ startMinute: 1080, endMinute: 1110 }] },
  ],
};

/** Explicit zone, rejected DST gaps/folds; an explicit valid offset resolves a fold. */
export function localInstant(local: string, timeZone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:[+-]\d{2}:\d{2})?$/.test(local)) {
    throw new RangeError('Use an ISO local date/time with an optional explicit offset.');
  }
  return Temporal.ZonedDateTime.from(`${local}[${timeZone}]`, {
    disambiguation: 'reject', offset: 'reject', overflow: 'reject',
  }).epochMilliseconds;
}

function validMinutes(interval: MinuteInterval) {
  if (!Number.isInteger(interval.startMinute) || !Number.isInteger(interval.endMinute)
    || interval.startMinute < 0 || interval.endMinute > 1440 || interval.startMinute >= interval.endMinute) {
    throw new RangeError('Invalid shift/break minutes; split overnight shifts at midnight.');
  }
}

/** Compile once, outside render loops. Half-open UTC intervals never count a break twice. */
export function compileCalendar(definition: CalendarDefinition, fromDate: string, untilDate: string): PlantCalendar {
  const first = Temporal.PlainDate.from(fromDate), last = Temporal.PlainDate.from(untilDate);
  const days = first.until(last).days;
  // A366-day run starting06:00 needs the following local date compiled too.
  if (days <= 0 || days > 367) throw new RangeError('Calendar must span1–367 local dates.');
  const excluded = new Set(definition.excludedDates.map(date => Temporal.PlainDate.from(date).toString()));
  const definitions = definition.shifts.map(shift => {
    validMinutes(shift);
    if (!shift.label || !shift.weekdays.every(day => Number.isInteger(day) && day >= 1 && day <= 7)) {
      throw new RangeError('Invalid shift label or weekday.');
    }
    const breaks = [...shift.breaks].sort((a, b) => a.startMinute - b.startMinute);
    let previousEnd = shift.startMinute;
    for (const pause of breaks) {
      validMinutes(pause);
      if (pause.startMinute < previousEnd || pause.endMinute > shift.endMinute) {
        throw new RangeError('Breaks overlap or fall outside their shift.');
      }
      previousEnd = pause.endMinute;
    }
    return { ...shift, breaks };
  });
  // Reject even overlaps on excluded dates, rather than silently accepting invalid definitions.
  for (let day = 1; day <= 7; day++) {
    const shifts = definitions.filter(shift => shift.weekdays.includes(day)).sort((a, b) => a.startMinute - b.startMinute);
    if (shifts.some((shift, index) => index > 0 && shift.startMinute < shifts[index - 1].endMinute)) {
      throw new RangeError('Shifts overlap.');
    }
  }
  const instantAt = (date: Temporal.PlainDate, minute: number) => {
    const local = date.toPlainDateTime('00:00').add({ minutes: minute }).toString();
    return localInstant(local, definition.timeZone);
  };
  const shifts: { start: number; end: number; label: string }[] = [];
  const working: TimeInterval[] = [];
  const boundaries = new Map<number, string[]>();
  const boundary = (instant: number, label: string) => boundaries.set(instant, [...(boundaries.get(instant) ?? []), label]);
  for (let index = 0; index < days; index++) {
    const date = first.add({ days: index });
    if (excluded.has(date.toString())) continue;
    for (const shift of definitions.filter(item => item.weekdays.includes(date.dayOfWeek))) {
      const start = instantAt(date, shift.startMinute), end = instantAt(date, shift.endMinute);
      shifts.push({ start, end, label: shift.label });
      boundary(start, `${shift.label} starts`); boundary(end, `${shift.label} ends`);
      let cursor = start;
      for (const pause of shift.breaks) {
        const breakStart = instantAt(date, pause.startMinute), breakEnd = instantAt(date, pause.endMinute);
        if (breakStart > cursor) working.push({ start: cursor, end: breakStart });
        boundary(breakStart, 'Break starts'); boundary(breakEnd, 'Break ends');
        cursor = breakEnd;
      }
      if (cursor < end) working.push({ start: cursor, end });
    }
  }
  return {
    timeZone: definition.timeZone, start: instantAt(first, 0), end: instantAt(last, 0),
    shifts: shifts.sort((a, b) => a.start - b.start), working: working.sort((a, b) => a.start - b.start),
    boundaries: [...boundaries].sort(([a], [b]) => a - b).map(([instant, labels]) => ({ instant, label: labels.join(' · ') })),
  };
}

function inRange(calendar: PlantCalendar, instant: number) {
  if (!Number.isSafeInteger(instant) || instant < calendar.start || instant > calendar.end) {
    throw new RangeError('Instant falls outside the compiled calendar.');
  }
}

function firstAfter<T>(items:readonly T[],instant:number,value:(item:T)=>number) {
  let low=0,high=items.length;
  while(low<high){const middle=(low+high)>>>1;if(value(items[middle])<=instant)low=middle+1;else high=middle;}
  return low;
}

export function calendarStateAt(calendar: PlantCalendar, instant: number) {
  inRange(calendar, instant);
  const candidate=calendar.shifts[firstAfter(calendar.shifts,instant,item=>item.end)];
  const shift=candidate&&candidate.start<=instant?candidate:undefined;
  const interval=calendar.working[firstAfter(calendar.working,instant,item=>item.end)];
  const working=interval&&interval.start<=instant;
  return { status: working ? 'working' : shift ? 'break' : 'off-shift', shift: shift?.label ?? null } as const;
}

export function nextBoundary(calendar: PlantCalendar, instant: number) {
  inRange(calendar, instant);
  return calendar.boundaries[firstAfter(calendar.boundaries,instant,item=>item.instant)] ?? null;
}

export function workingTimeBetween(calendar: PlantCalendar, start: number, end: number) {
  inRange(calendar, start); inRange(calendar, end);
  if (end < start) throw new RangeError('End must follow start.');
  let total=0;
  for(let i=firstAfter(calendar.working,start,item=>item.end);i<calendar.working.length&&calendar.working[i].start<end;i++){
    const interval=calendar.working[i];total+=Math.max(0,Math.min(end,interval.end)-Math.max(start,interval.start));
  }
  return total;
}

export function addWorkingTime(calendar: PlantCalendar, start: number, durationMs: number): number {
  inRange(calendar, start);
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) throw new RangeError('Working duration must be nonnegative integer milliseconds.');
  if (durationMs === 0) return start;
  let remaining = durationMs;
  for (let i=firstAfter(calendar.working,start,item=>item.end);i<calendar.working.length;i++) {
    const interval=calendar.working[i];
    const begin = Math.max(start, interval.start), available = Math.max(0, interval.end - begin);
    if (available > 0 && remaining <= available) return begin + remaining;
    remaining -= available;
  }
  throw new RangeError('Not enough working time in the compiled calendar.');
}

/** Productive time remaining on this local date, excluding breaks and closed shifts. */
export function workingTimeLeftToday(calendar: PlantCalendar, instant: number): number {
  const tomorrow = Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(calendar.timeZone)
    .startOfDay().add({days: 1}).epochMilliseconds;
  return workingTimeBetween(calendar, instant, Math.min(tomorrow, calendar.end));
}
