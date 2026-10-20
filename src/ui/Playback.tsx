import { useEffect, useState, useSyncExternalStore } from 'react';
import { demoClock } from '../demo/clock';

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function Playback() {
  const playback = useSyncExternalStore(demoClock.subscribe, demoClock.getSnapshot, demoClock.getSnapshot);
  const [elapsed, setElapsed] = useState(demoClock.getElapsedSeconds());
  useEffect(() => {
    if (!playback.playing) { setElapsed(demoClock.getElapsedSeconds()); return; }
    const timer = window.setInterval(() => setElapsed(demoClock.getElapsedSeconds()), 250);
    return () => window.clearInterval(timer);
  }, [playback.playing]);

  return <>
    <nav className="playback-bar" aria-label="Demonstration playback">
    <span className="playback-label">PREVIEW TIME</span>
    <output className="playback-time" aria-live="off">{formatTime(elapsed)}</output>
    <span className="playback-divider" />
    <button className="playback-toggle" onClick={() => demoClock.togglePlaying()}
      aria-label={playback.playing ? 'Pause demonstration' : 'Play demonstration'}>
      {playback.playing ? 'Pause' : 'Play'}
    </button>
    <button className="playback-reset" onClick={() => { demoClock.seek(0); setElapsed(0); }}
      aria-label="Restart demonstration" title="Restart from the beginning">Restart</button>
    <label className="speed-control">Speed
      <select aria-label="Demonstration speed" value={playback.speed}
        onChange={event => demoClock.setSpeed(Number(event.target.value) as 0.5 | 1 | 2)}>
        <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
      </select>
    </label>
    <span className="playback-caption">Scripted motion · independent clock</span>
    </nav>
  </>;
}
