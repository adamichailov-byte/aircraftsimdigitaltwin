import {addWorkingTime,workingTimeBetween} from './calendar.ts';
import type {PlantCalendar} from './types.ts';

/** Synthetic handoff allowance; breaks and closed shifts do not consume it. */
export const defaultStationBufferMs=30*60_000;
export function stationBufferDeadline(calendar:PlantCalendar,start:number,durationMs=defaultStationBufferMs){
  return workingTimeBetween(calendar,start,calendar.end)<durationMs?calendar.end:addWorkingTime(calendar,start,durationMs);
}
