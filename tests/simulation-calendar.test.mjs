import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCalendar, defaultCalendar, localInstant, addWorkingTime, workingTimeBetween,
  calendarStateAt, nextBoundary } from '../src/simulation/calendar.ts';

const HOUR = 3_600_000;
const at = local => localInstant(local, 'America/New_York');
const calendar = () => compileCalendar(defaultCalendar, '2027-01-04', '2027-04-04');

test('Friday21 plus two productive hours ends Monday07; elapsed cure crosses the weekend', () => {
  const start = at('2027-01-08T21:00');
  assert.equal(addWorkingTime(calendar(), start, 2 * HOUR), at('2027-01-11T07:00'));
  assert.equal(at('2027-01-08T22:00') + 8 * HOUR, at('2027-01-09T06:00'));
});

test('break and shift boundaries are half-open and exact completion stays at shift end', () => {
  const c = calendar();
  assert.equal(workingTimeBetween(c, at('2027-01-04T06:00'), at('2027-01-05T06:00')), 15 * HOUR);
  assert.equal(addWorkingTime(c, at('2027-01-04T09:00'), HOUR), at('2027-01-04T10:00'));
  assert.equal(addWorkingTime(c, at('2027-01-04T09:00'), 2 * HOUR), at('2027-01-04T11:30'));
  assert.equal(calendarStateAt(c, at('2027-01-04T10:00')).status, 'break');
  assert.equal(calendarStateAt(c, at('2027-01-04T10:30')).status, 'working');
  assert.equal(calendarStateAt(c, at('2027-01-04T14:00')).shift, 'Shift 2');
  assert.equal(calendarStateAt(c, at('2027-01-04T22:00')).status, 'off-shift');
  assert.equal(nextBoundary(c, at('2027-01-04T10:00')).instant, at('2027-01-04T10:30'));
});

test('month boundary and excluded dates skip closed days without inventing work', () => {
  const c = compileCalendar({...defaultCalendar, excludedDates: ['2027-02-01']}, '2027-01-29', '2027-02-04');
  assert.equal(addWorkingTime(c, at('2027-01-29T21:00'), 2 * HOUR), at('2027-02-02T07:00'));
  assert.equal(workingTimeBetween(c, at('2027-01-30T00:00'), at('2027-02-02T06:00')), 0);
});

test('local conversion rejects invalid dates, DST gaps/folds and conflicting offsets', () => {
  for (const local of ['2027-03-14T02:30', '2027-11-07T01:30', '2027-02-30T06:00', '2027-01-04T06:00+09:00', '2027-01-04T06:00Z']) {
    assert.throws(() => at(local), RangeError);
  }
  assert.equal(at('2027-11-07T01:30-05:00') - at('2027-11-07T01:30-04:00'), HOUR);
  assert.equal(at('2027-03-15T06:00'), Date.parse('2027-03-15T10:00:00Z'));
});

test('DST working intervals follow local shifts and midnight remains a real boundary', () => {
  const sunday = {...defaultCalendar, shifts: [{label:'Night', weekdays:[7], startMinute:0, endMinute:240, breaks:[]}]};
  const spring = compileCalendar(sunday, '2027-03-14', '2027-03-15');
  const fall = compileCalendar(sunday, '2027-11-07', '2027-11-08');
  assert.equal(workingTimeBetween(spring, spring.start, spring.end), 3 * HOUR);
  assert.equal(workingTimeBetween(fall, fall.start, fall.end), 5 * HOUR);
  const midnight = compileCalendar({...sunday, shifts:[{label:'Evening', weekdays:[1], startMinute:1320, endMinute:1440, breaks:[]}]}, '2027-01-04', '2027-01-06');
  assert.equal(addWorkingTime(midnight, at('2027-01-04T22:00'), 2 * HOUR), at('2027-01-05T00:00'));
});

test('overlaps, invalid breaks/zone/range are rejected; empty calendar is bounded', () => {
  assert.throws(() => compileCalendar({...defaultCalendar, shifts:[defaultCalendar.shifts[0], defaultCalendar.shifts[0]]}, '2027-01-04', '2027-01-06'), /overlap/i);
  assert.throws(() => compileCalendar({...defaultCalendar, shifts:[{...defaultCalendar.shifts[0], breaks:[{startMinute:300,endMinute:400}]}]}, '2027-01-04', '2027-01-06'), RangeError);
  assert.throws(() => localInstant('2027-01-04T06:00','Invalid/Zone'), RangeError);
  assert.throws(() => compileCalendar({...defaultCalendar, shifts:[{...defaultCalendar.shifts[0], breaks:[{startMinute:600,endMinute:640},{startMinute:630,endMinute:660}]}]}, '2027-01-04', '2027-01-06'), /overlap/i);
  assert.throws(() => compileCalendar(defaultCalendar,'2027-01-04','2028-02-01'), RangeError);
  const empty = compileCalendar({...defaultCalendar, shifts:[]}, '2027-01-04','2027-01-06');
  assert.equal(nextBoundary(empty, empty.start), null);
  assert.equal(calendarStateAt(empty,empty.start).status, 'off-shift');
  assert.throws(() => addWorkingTime(empty,empty.start,HOUR), /working time/i);
  assert.throws(() => addWorkingTime(calendar(),at('2027-01-04T06:00'),-1), RangeError);
});
