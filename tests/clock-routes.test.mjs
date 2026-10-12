import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoClock, bindClockToDocument } from '../src/demo/clock.ts';
import { personPoseAt, personRoutes } from '../src/demo/routes.ts';
import { aircraftEntities, people } from '../src/demo/entities.ts';

test('one clock applies pause, reset and all demonstration speeds', () => {
  const clock = new DemoClock();
  clock.advance(0.1);
  assert.equal(clock.getElapsedSeconds(), 0.1);
  clock.setSpeed(0.5);
  clock.advance(0.1);
  assert.ok(Math.abs(clock.getElapsedSeconds() - 0.15) < 1e-9);
  clock.setSpeed(2);
  clock.advance(0.1);
  assert.ok(Math.abs(clock.getElapsedSeconds() - 0.35) < 1e-9);
  clock.setPlaying(false);
  clock.advance(5);
  assert.ok(Math.abs(clock.getElapsedSeconds() - 0.35) < 1e-9);
  clock.reset();
  assert.equal(clock.getElapsedSeconds(), 0);
});

test('reduced motion begins paused and a hidden tab pauses without a resume jump', () => {
  const clock = new DemoClock(true);
  assert.equal(clock.getSnapshot().playing, false);
  clock.advance(3);
  assert.equal(clock.getElapsedSeconds(), 0);

  const originalDocument = globalThis.document;
  const listeners = new Map();
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name),
  };
  try {
    const unbind = bindClockToDocument(clock);
    clock.setPlaying(true);
    clock.advance(0.1);
    const beforeHide = clock.getElapsedSeconds();
    globalThis.document.visibilityState = 'hidden';
    listeners.get('visibilitychange')();
    globalThis.document.visibilityState = 'visible';
    clock.advance(2);
    assert.equal(clock.getSnapshot().playing, false);
    assert.equal(clock.getElapsedSeconds(), beforeHide);
    unbind();
  } finally {
    globalThis.document = originalDocument;
  }
});

test('technician routes retain selectable identities and stay outside aircraft footprints', () => {
  assert.equal(personRoutes.length, 14);
  assert.equal(new Set(personRoutes.map(route => route.entityId)).size, 14);
  for (const route of personRoutes) {
    assert.ok(people.some(person => person.id === route.entityId), route.entityId);
    const person = people.find(item => item.id === route.entityId);
    const aircraft = aircraftEntities.find(item => item.zoneId === person.zoneId);
    for (const [xM, zM] of route.pointsM) {
      if (aircraft) {
        assert.ok(Math.abs(xM - aircraft.positionM[0]) >= 30 || Math.abs(zM - aircraft.positionM[2]) >= 30,
          `${route.entityId} stays outside the aircraft footprint`);
      }
      assert.ok(Number.isFinite(xM + zM));
    }
  }
  const route = personRoutes[0];
  assert.deepEqual(personPoseAt(route, 0), { xM: -220, zM: -161, heading: 0, gait: 0, working: true });
  const midpoint = personPoseAt(route, 7 + (32 / 0.9) / 2);
  assert.equal(midpoint.xM, -220);
  assert.equal(midpoint.zM, -145);
  assert.equal(midpoint.working, false);
  assert.notEqual(midpoint.gait, 0);
});
