import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationClock, bindSimulationClock } from '../src/simulation/clock.ts';

test('sparse and frequent timer ticks produce the same instant, independent of rendering', () => {
  let wall = 0;
  const sparse = new SimulationClock(0,1e12,()=>wall);
  const frequent = new SimulationClock(0,1e12,()=>wall);
  sparse.setPlaying(true); frequent.setPlaying(true);
  for (wall=100;wall<=10_000;wall+=100) frequent.tick();
  wall=10_000; sparse.tick();
  assert.equal(sparse.getSnapshot().instant,36_000_000);
  assert.equal(sparse.getSnapshot().instant,frequent.getSnapshot().instant);
});

test('speed changes settle old elapsed time, pause settles the remainder, reset always emits', () => {
  let wall=0, emissions=0;
  const clock = new SimulationClock(1000,1e12,()=>wall);
  const unsubscribe = clock.subscribe(()=>emissions++);
  clock.setPlaying(true); wall=1000; clock.setSpeed(60_000);
  wall=2000; clock.setPlaying(false);
  assert.equal(clock.getSnapshot().instant,3_661_000);
  wall=50_000; clock.tick();
  assert.equal(clock.getSnapshot().instant,3_661_000);
  clock.reset(); const revision=clock.getSnapshot().revision, before=emissions;
  clock.reset();
  assert.equal(clock.getSnapshot().instant,1000);
  assert.equal(clock.getSnapshot().playing,false);
  assert.equal(clock.getSnapshot().revision,revision+1);
  assert.equal(emissions,before+1);
  unsubscribe();
  assert.throws(()=>clock.setSpeed(0), RangeError);
  assert.throws(()=>clock.seek(-1), RangeError);
});

test('driver pauses on hide, never catches up on show, and removes its listener on cleanup', () => {
  let wall=0;
  const listeners=new Map();
  const doc={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const clock=new SimulationClock(0,1e12,()=>wall);
  const stop=bindSimulationClock(clock,doc);
  clock.setPlaying(true);wall=1000;doc.hidden=true;listeners.get('visibilitychange')();
  const hidden=clock.getSnapshot().instant;
  wall=100_000;doc.hidden=false;listeners.get('visibilitychange')();clock.tick();
  assert.equal(clock.getSnapshot().instant,hidden);
  assert.equal(clock.getSnapshot().playing,false);
  clock.setPlaying(true);wall+=1000;clock.tick();
  assert.equal(clock.getSnapshot().instant,hidden+3_600_000);
  stop();assert.equal(listeners.size,0);
});

test('horizon clamps and pauses; seek is paused and observable at the same instant', () => {
  let wall=0;
  const clock=new SimulationClock(0,10_000,()=>wall);
  clock.setPlaying(true);wall=1000;clock.tick();
  assert.equal(clock.getSnapshot().instant,10_000);
  assert.equal(clock.getSnapshot().playing,false);
  clock.seek(5000);const previous=clock.getSnapshot();clock.seek(5000);
  assert.notEqual(clock.getSnapshot(),previous);
  assert.throws(()=>clock.seek(Number.NaN), RangeError);
});
