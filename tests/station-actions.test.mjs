import test from 'node:test';
import assert from 'node:assert/strict';
import { stationActionAt, stationWorkActiveForZone } from '../src/demo/station-actions.ts';
import { personPoseAt, personRoutes } from '../src/demo/routes.ts';

test('wing crane, engine hoist, and paint carriage have distinct repeatable work beats', () => {
  const wing = stationActionAt('wing-crane', 6);
  const engine = stationActionAt('engine-hoist', 26);
  const paint = stationActionAt('paint-carriage', 48);

  assert.equal(wing?.phase, 'traverse');
  assert.ok(wing && wing.trolleyXM > -22 && wing.trolleyXM < 22);
  assert.equal(engine?.phase, 'aligning');
  assert.ok(engine && engine.trolleyXM > 0 && engine.trolleyXM < 4);
  assert.equal(paint?.phase, 'spray-pass');
  assert.equal(paint?.sprayActive, true);
  assert.ok(paint && paint.trolleyXM > -28 && paint.trolleyXM < 28);
});

test('station beats use non-overlapping windows and return to their cycle start', () => {
  for (const [time, zone] of [[8, 'bay-2'], [28, 'bay-4'], [48, 'paint']]) {
    assert.equal(stationWorkActiveForZone(zone, time), true);
  }
  assert.equal(stationWorkActiveForZone('bay-2', 19), false);
  assert.equal(stationWorkActiveForZone('bay-4', 39), false);
  assert.equal(stationWorkActiveForZone('paint', 59), false);
  assert.deepEqual(stationActionAt('wing-crane', 0), stationActionAt('wing-crane', 60));
});

test('workers hold at the authored safe point while their station is active', () => {
  const route = {
    entityId: 'person-tech-22',
    pointsM: [[-76, -212], [-76, -205]],
    safeWaitPointM: [-76, -212],
    speedMps: 0.9,
    workSeconds: 7,
    phaseSeconds: 0,
  };
  const held = personPoseAt(route, 10, true);
  assert.equal(held.xM, -76);
  assert.equal(held.zM, -212);
  assert.equal(held.gait, 0);
  assert.equal(held.working, true);
  assert.notDeepEqual(personPoseAt(route, 10), held);
});

test('wing and engine technicians have authored stand-off points beyond their machine envelopes', () => {
  const wingTechs = personRoutes.filter(route => route.stationWorkZoneId === 'bay-2');
  const engineTechs = personRoutes.filter(route => route.stationWorkZoneId === 'bay-4');
  assert.equal(wingTechs.length, 2);
  assert.equal(engineTechs.length, 2);
  assert.ok(wingTechs.every(route => Math.abs(route.safeWaitPointM[1] + 145) > 58));
  assert.ok(engineTechs.every(route => Math.hypot(route.safeWaitPointM[0] + 149, route.safeWaitPointM[1] - 121) > 14));
});
