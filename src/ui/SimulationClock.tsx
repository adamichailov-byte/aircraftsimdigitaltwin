import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { addWorkingTime, calendarStateAt, localInstant, nextBoundary } from '../simulation/calendar';
import { bindSimulationClock, SimulationClock as PlantClock, simulationSpeeds } from '../simulation/clock';
import type { PilotSession } from '../simulation/engine';
import { a100Pilot } from '../simulation/fixtures/a100';

const { calendar, start, end } = a100Pilot;
const friday = localInstant('2027-01-08T21:00', calendar.timeZone);
const monday = addWorkingTime(calendar, friday, 2 * 3_600_000);
const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: calendar.timeZone,
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: calendar.timeZone,
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const boundaryFormat = new Intl.DateTimeFormat('en-US', { timeZone: calendar.timeZone,
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const speedLabels = ['1 sim min / sec', '1 sim hour / sec', '1 sim day / sec'];

export function SimulationClock({ session, onToggleMode }: { session?: PilotSession; onToggleMode: () => void }) {
  const [previewClock] = useState(() => new PlantClock(start, end));
  const clock = session?.clock ?? previewClock;
  const schedule = useRef<HTMLDetailsElement>(null);
  const snapshot = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  useEffect(() => {
    const stop = bindSimulationClock(clock);
    return () => { stop(); clock.setPlaying(false); };
  }, [clock]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (schedule.current?.open && event.target instanceof Node && !schedule.current.contains(event.target)) schedule.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && schedule.current?.open) {
        schedule.current.open = false; schedule.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  const state = calendarStateAt(calendar, snapshot.instant);
  const next = nextBoundary(calendar, snapshot.instant);
  const status = state.status === 'working' ? `${state.shift} · Working`
    : state.status === 'break' ? `${state.shift} · Break` : 'Off shift';
  const atEnd = snapshot.instant === end;

  return <section className="simulation-clock" aria-label={session ? 'Aircraft simulation clock' : 'Plant calendar pilot'}>
    <div className="calendar-reading">
      <span className="calendar-label">{session ? 'AIRCRAFT PILOT' : 'CALENDAR PILOT'}</span>
      <time dateTime={new Date(snapshot.instant).toISOString()} aria-label="Plant date and time">
        {dateFormat.format(snapshot.instant)} <strong>{timeFormat.format(snapshot.instant)}</strong>
      </time>
      <span className="calendar-status">{atEnd ? 'Pilot horizon reached' : status}</span>
    </div>
    <div className="calendar-controls">
      <button aria-label={session ? (snapshot.playing ? 'Pause pilot' : 'Play pilot') : (snapshot.playing ? 'Pause calendar' : 'Play calendar')}
        disabled={atEnd} onClick={() => clock.setPlaying(!snapshot.playing)}>{snapshot.playing ? 'Pause' : 'Play'}</button>
      {session ? <button disabled={session.getSnapshot().nextEventInstant === null} onClick={() => session.nextOperation()}>Next operation</button>
        : <button disabled={!next} onClick={() => { if (next) clock.seek(next.instant); }}>Next boundary</button>}
      {session && <button disabled={session.getSnapshot().nextEventInstant === null} onClick={() => session.nextEvent()}>Next event</button>}
      <button onClick={() => session ? session.reset() : clock.reset()} aria-label={session ? 'Reset pilot' : 'Reset calendar'}>Reset</button>
      <label className="calendar-speed"><span className="sr-only">Calendar speed</span>
        <select aria-label="Calendar speed" title="Simulated time per real second" value={snapshot.speed} onChange={event => clock.setSpeed(Number(event.target.value))}>
          {simulationSpeeds.map((speed, index) => <option key={speed} value={speed}>{speedLabels[index]}</option>)}
        </select>
      </label>
      <details ref={schedule} className="calendar-details">
        <summary>Schedule</summary>
        <div className="calendar-schedule">
          <strong>Plant calendar · assumption v1</strong>
          <p>America/New_York · Jan 4–Apr 4, 2027<br />Weekdays 06:00–14:00 / 14:00–22:00<br />Breaks 10:00–10:30 / 18:00–18:30</p>
          <p>15 working hours per weekday. Nights and weekends add no productive time. {session ? 'The aircraft and task panel share this clock. Cure, towing and flight use elapsed time; other equipment is scenery.' : 'Calendar pilot only; aircraft motion has its own scripted preview clock.'}</p>
          <button onClick={() => { if (schedule.current) schedule.current.open = false; onToggleMode(); }}>{session ? 'Open scripted preview' : 'Open full recipe pilot'}</button>
          {!session && <div className="calendar-example">
            <strong>Try the weekend</strong>
            <p>Friday Jan 8, 21:00 + 2 working hours = {dateFormat.format(monday)}, {timeFormat.format(monday)}. One hour Friday, one hour Monday.</p>
            <button onClick={() => clock.seek(friday)}>Start Friday 21:00</button>
            <button disabled={snapshot.instant !== friday} onClick={() => clock.seek(addWorkingTime(calendar, snapshot.instant, 2 * 3_600_000))}>Add 2 working hours</button>
          </div>}
        </div>
      </details>
    </div>
    <p className="calendar-next">{next ? `Next: ${next.label} · ${boundaryFormat.format(next.instant)}` : 'No remaining shift boundary'}
      {' '}<span>America/New_York · {session ? `${session.engine.definition.serialId} · one complete recipe` : 'scene: scripted preview (separate clock)'}</span></p>
  </section>;
}
