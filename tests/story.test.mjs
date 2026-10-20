import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoClock } from '../src/demo/clock.ts';
import { aircraftEntities } from '../src/demo/entities.ts';
import { buildings } from '../src/demo/campus.ts';
import { aircraftTransferRoutes, storyAt, storyMachineTimeAt, storyFleetAt } from '../src/demo/story.ts';
import { overviewZoneIds } from '../src/demo/zone-labels.ts';

test('each aircraft has its own identity and the factory starts with occupied bays plus an intake queue', () => {
  const fleet = storyFleetAt(0);
  assert.equal(fleet.length, aircraftEntities.length);
  assert.equal(new Set(fleet.map(plane => plane.entityId)).size, fleet.length);
  assert.equal(fleet.filter(plane => plane.mode === 'working').length, 9);
  assert.equal(fleet.filter(plane => plane.mode === 'queue').length, 3);
  assert.equal(storyAt(0).entityId, 'aircraft-join');
  assert.equal(storyAt(0).variant, 'sectioned');
  assert.equal(storyAt(0, 'aircraft-wing-tail').variant, 'bare');
  assert.equal(storyAt(0, 'aircraft-systems').variant, 'systems');
  assert.equal(storyAt(0, 'aircraft-queue-10').zoneId, 'receiving');
});

test('an aircraft waits while the next bay remains occupied, then moves forward through each row', () => {
  assert.equal(storyAt(25, 'aircraft-wing-tail').mode, 'waiting');
  assert.equal(storyAt(25, 'aircraft-wing-tail').waitingFor, 'Bay 03');
  assert.equal(storyAt(25, 'aircraft-systems').zoneId, 'bay-3');
  const checkpoints = [storyAt(0), storyAt(195), storyAt(295), storyAt(375)];
  assert.deepEqual(checkpoints.map(plane => plane.zoneId), ['bay-1', 'bay-2', 'bay-3', 'bay-4']);
  assert.deepEqual(overviewZoneIds.filter(id => /^bay-[1-6]$/.test(id)),
    ['bay-1', 'bay-2', 'bay-3', 'bay-4', 'bay-5', 'bay-6']);
  for (let seconds = 0; seconds <= 720; seconds += 1) {
    const occupied = storyFleetAt(seconds).filter(plane => plane.mode === 'working' || plane.mode === 'waiting')
      .map(plane => plane.zoneId).filter(zone => /^bay-|^paint$|^flightline$|^delivery$/.test(zone));
    assert.equal(new Set(occupied).size, occupied.length, `station collision at ${seconds}s`);
  }
});

test('each product asset keeps its id while gaining later assemblies and reaching delivery', () => {
  const id = 'aircraft-gear-engines';
  const before = storyAt(0, id);
  assert.equal(storyAt(145, id).entityId, before.entityId);
  assert.equal(storyAt(340, id).variant, 'paint');
  assert.equal(storyAt(420, id).variant, 'complete');
  const finished = storyAt(450, id);
  assert.equal(finished.entityId, before.entityId);
  assert.equal(finished.variant, 'complete');
  assert.ok(['delivery', 'offsite'].includes(finished.zoneId));
});

test('Bay 06 aircraft stays unpainted until it reaches the paint booth', () => {
  const beforePaint = storyAt(0, 'aircraft-ground-check');
  assert.equal(beforePaint.zoneId, 'bay-6');
  assert.equal(beforePaint.variant, 'ready-for-paint');
  const inPaint = storyAt(120, 'aircraft-ground-check');
  assert.equal(inPaint.zoneId, 'paint');
  assert.equal(inPaint.variant, 'paint');
  assert.equal(storyAt(210, 'aircraft-ground-check').variant, 'complete');
});

test('the Bay 03-to-04 route clears paint and the parked inbound freighter', () => {
  const route = aircraftTransferRoutes.bay3ToBay4;
  const paint = { minX: 60, maxX: 148, minZ: -70, maxZ: 10 };
  const freighter = { x: 330, z: -335, clearance: 45 };
  for (const [x, z] of route) {
    assert.ok(x < paint.minX || x > paint.maxX || z < paint.minZ || z > paint.maxZ,
      `route point (${x}, ${z}) enters paint booth`);
    assert.ok(Math.hypot(x - freighter.x, z - freighter.z) > freighter.clearance,
      `route point (${x}, ${z}) approaches parked freighter`);
  }
});

test('paint aircraft enters forward, reverses out of the booth, then taxis onward', () => {
  const id = 'aircraft-ground-check';
  assert.equal(storyAt(110, id).motionMode, 'forward', 'the aircraft should enter the booth nose-first');
  assert.equal(storyAt(120, id).zoneId, 'paint');
  assert.equal(storyAt(120, id).variant, 'paint');
  assert.equal(storyAt(150, id).motionMode, 'reverse', 'the aircraft should reverse out through the booth and hangar doors');
  assert.equal(storyAt(153, id).motionMode, 'turn', 'the aircraft should turn outside after clearing the hangar');
  assert.equal(storyAt(156, id).motionMode, 'forward', 'the aircraft should taxi toward checks in the right direction');
  assert.equal(storyAt(0, 'aircraft-paint').variant, 'paint');
});

test('Bay 06 exits through its hangar door, loops outside, and enters paint from the right', () => {
  const route = aircraftTransferRoutes.bay6ToPaint;
  const assembly = buildings.find(building => building.id === 'assembly');
  assert.ok(assembly?.additionalEndDoors?.some(door => door.centerOffsetM === 115),
    'an east-side hangar door should align with the Bay 06 transfer lane');
  assert.deepEqual(route.slice(0, 3), [[104, 85], [130, 85], [180, 85]],
    'the aircraft should travel east toward the new Bay 06 hangar door');
  assert.ok(route.some(([x]) => x > 180), 'the route should visibly leave the assembly building');
  assert.deepEqual(route.slice(-2), [[148, -30], [104, -30]],
    'the aircraft should enter paint through its east door, moving right to left');
});

test('paint reverse exit clears the booth and hangar before facing flight-line checks', () => {
  const reverse = aircraftTransferRoutes.paintReverseOut;
  const taxi = aircraftTransferRoutes.paintTaxiToChecks;
  assert.deepEqual(reverse, [[104, -30], [148, -30], [180, -30], [220, -30]],
    'reverse motion should back through paint and the east hangar door before turning');
  assert.ok(taxi[0][0] > 180 && taxi.at(-1)?.[0] === 230 && taxi.at(-1)?.[1] === 280,
    'forward taxi should start outdoors and finish at flight-line checks');
});

test('the full simulation shares one clock without chapter seek controls', () => {
  const moving = Array.from({ length: 720 }, (_, seconds) => storyAt(seconds))
    .find(plane => plane.mode === 'transit');
  assert.ok(moving, 'the aircraft should advance on the continuous clock');
  assert.equal('chapter' in moving, false);
  assert.equal(storyMachineTimeAt(moving.transferStartSeconds), storyMachineTimeAt(moving.transferEndSeconds));
  const clock = new DemoClock();
  clock.seek(175);
  assert.equal(clock.getElapsedSeconds(), 175);
  clock.setPlaying(false);
  clock.seek(0);
  assert.equal(clock.getSnapshot().playing, false);
  assert.equal(clock.getElapsedSeconds(), 0);
});
