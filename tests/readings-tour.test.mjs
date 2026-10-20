import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectableEntities } from '../src/demo/entities.ts';
import { readingsForEntity } from '../src/demo/readings.ts';
import { stationActionAt } from '../src/demo/station-actions.ts';
import { tourCommandForKey, tourStops } from '../src/demo/tour.ts';

test('selected machines show 3–4 deterministic illustrative readings with sensible units', () => {
  const machines = inspectableEntities.filter(entity => entity.kind === 'machine');
  for (const machine of machines) {
    const action = stationActionAt(machine.id, 10);
    const readings = readingsForEntity(machine, 10, action);
    assert.ok(readings.length >= 2 && readings.length <= 3, machine.id);
    assert.equal(readings.some(reading => reading.label === 'Assigned team'), false);
    assert.equal(JSON.stringify(readings), JSON.stringify(readingsForEntity(machine, 10, action)));
    assert.ok(readings.find(reading => reading.label === 'Sample status'));
    if (action) assert.equal(readings[0].value, action.mode);
  }
  const paint = readingsForEntity(inspectableEntities.find(entity => entity.id === 'paint-carriage'), 10,
    stationActionAt('paint-carriage', 10));
  const temperature = paint.find(reading => reading.label === 'Booth air sample');
  assert.equal(temperature.unit, '°C');
  assert.ok(Number(temperature.value) >= 19.5 && Number(temperature.value) <= 22.5);
  assert.deepEqual(readingsForEntity(inspectableEntities.find(entity => entity.kind === 'aircraft'), 0, null), []);
});

test('machine work progress follows the shared station action clock including standby at reset', () => {
  const crane = inspectableEntities.find(entity => entity.id === 'wing-crane');
  const active = readingsForEntity(crane, 6, stationActionAt('wing-crane', 6));
  const idle = readingsForEntity(crane, 20, stationActionAt('wing-crane', 20));
  assert.equal(active[0].value, stationActionAt('wing-crane', 6).mode);
  assert.match(active[1].value, /^\d+%$/);
  assert.equal(idle[1].value, 'Standby');
});

test('guided tour order and keyboard commands are explicit and manual', () => {
  assert.deepEqual(tourStops.map(stop => stop.zoneId), ['receiving', 'bay-1', 'bay-3', 'bay-5', 'bay-6', 'paint', 'flightline', 'delivery']);
  assert.equal(tourCommandForKey('ArrowRight'), 'next');
  assert.equal(tourCommandForKey('n'), 'next');
  assert.equal(tourCommandForKey('ArrowLeft'), 'back');
  assert.equal(tourCommandForKey('b'), 'back');
  assert.equal(tourCommandForKey('Escape'), 'exit');
  assert.equal(tourCommandForKey('x'), 'exit');
  assert.equal(tourCommandForKey('w'), null);
});
