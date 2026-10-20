import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionTimeAtPoint,
  cargoUnloadingPoseAt,
  MATERIAL_TIME_COMPRESSION,
  motionPlans,
  vehicleActionAt,
  vehicleActionDurationSeconds,
  vehiclePayloadPoseAt,
} from '../src/demo/vehicle-actions.ts';
import { siteRoutes } from '../src/demo/routes.ts';

const plan = id => motionPlans.find(candidate => candidate.entityId === id);

test('material carriers have named routes, turning points, and usable clear widths', () => {
  assert.equal(new Set(motionPlans.map(item => item.entityId)).size, motionPlans.length);
  for (const action of motionPlans) {
    assert.ok(action.pointsM.length >= 2, `${action.entityId} has a route`);
    assert.ok(action.clearWidthM >= 8, `${action.entityId} uses a defined lane`);
    assert.ok(vehicleActionDurationSeconds(action) > action.startDelaySeconds);
  }
  for (const id of ['road-delivery-truck', 'rail-forklift', 'material-tug']) {
    const points = plan(id).pointsM;
    assert.ok(points.some((point, index) => index > 1 &&
      (point[0] - points[index - 1][0]) * (points[index - 1][1] - points[index - 2][1]) !==
      (point[1] - points[index - 1][1]) * (points[index - 1][0] - points[index - 2][0])), `${id} turns`);
  }
  assert.ok(siteRoutes.find(route => route.id === 'wing-dolly-transfer').clearWidthM >= 28);
  assert.ok(siteRoutes.find(route => route.id === 'engine-dolly-transfer').clearWidthM >= 14);
});

test('forklift waits for its road crossing and carries one pallet from pickup through rack handoff', () => {
  const action = plan('rail-forklift');
  assert.ok(action);
  const crossingArrival = actionTimeAtPoint(action, action.yieldPointIndices[0], 'arrival');
  const crossing = vehicleActionAt(action, crossingArrival + 1);
  assert.equal(crossing.phase, 'yielding');
  assert.equal(crossing.carrying, false);

  const pickup = actionTimeAtPoint(action, action.pickupPointIndex, 'departure');
  const loaded = vehicleActionAt(action, pickup + 1);
  assert.equal(loaded.carrying, true);
  assert.equal(loaded.delivered, false);
  const carried = vehiclePayloadPoseAt(action, loaded, 0.7);
  assert.ok(carried.xM !== action.payloadStartM[0] || carried.zM !== action.payloadStartM[2]);

  const drop = actionTimeAtPoint(action, action.dropPointIndex, 'departure');
  assert.equal(vehicleActionAt(action, drop).carrying, false);
  assert.equal(vehicleActionAt(action, drop).delivered, true);
  assert.deepEqual(vehiclePayloadPoseAt(action, vehicleActionAt(action, drop), 0.7), action.payloadDropM);
});

test('material tug carries its cart through the outbound route, detaches at the bay, and returns empty', () => {
  const action = plan('material-tug');
  assert.ok(action);
  const pickup = actionTimeAtPoint(action, action.pickupPointIndex, 'departure');
  assert.equal(vehicleActionAt(action, pickup + 1).carrying, true);
  const drop = actionTimeAtPoint(action, action.dropPointIndex, 'departure');
  const delivered = vehicleActionAt(action, drop);
  assert.equal(delivered.carrying, false);
  assert.equal(delivered.delivered, true);
  const end = vehicleActionAt(action, vehicleActionDurationSeconds(action) + 1);
  assert.equal(end.phase, 'complete');
  assert.deepEqual(end.positionM, action.pointsM.at(-1));
  assert.deepEqual(vehiclePayloadPoseAt(action, end, 0.7), action.payloadDropM);
});

test('rail arrives from the siding, dwells at receiving, and resets to the rail entry', () => {
  const action = plan('inbound-train');
  assert.ok(action);
  const start = vehicleActionAt(action, 0);
  assert.deepEqual(start.positionM, action.pointsM[0]);
  assert.equal(start.phase, 'waiting');
  const arrival = actionTimeAtPoint(action, 1, 'arrival');
  assert.equal(vehicleActionAt(action, arrival + 1).phase, 'working');
  assert.deepEqual(vehicleActionAt(action, vehicleActionDurationSeconds(action) + 1).positionM,
    action.pointsM.at(-1));
});

test('cargo moves from the parked freighter down the loader and remains at its handoff', () => {
  const start = cargoUnloadingPoseAt(0);
  const middle = cargoUnloadingPoseAt(30);
  const finish = cargoUnloadingPoseAt(180);
  assert.equal(start.phase, 'waiting');
  assert.equal(middle.phase, 'moving');
  assert.ok(middle.yM < start.yM);
  assert.equal(finish.phase, 'delivered');
  assert.deepEqual([finish.xM, finish.yM, finish.zM], [312, 1.7, -313]);
});

test('vehicle motions are staggered at the shared receiving and service-road routes', () => {
  const truck = plan('road-delivery-truck');
  const forklift = plan('rail-forklift');
  const wing = plan('receiving-wing-stand');
  const engine = plan('receiving-engine-stand');
  const tug = plan('material-tug');
  assert.ok(vehicleActionDurationSeconds(truck) <= forklift.startDelaySeconds);
  assert.ok(vehicleActionDurationSeconds(forklift) <= wing.startDelaySeconds);
  assert.ok(actionTimeAtPoint(wing, wing.pointsM.length - 1, 'arrival') <= engine.startDelaySeconds);
  assert.ok(vehicleActionDurationSeconds(engine) <= tug.startDelaySeconds);
});

test('compressed material loop fits a short demonstration and reset restores single initial loads', () => {
  const loadedCarriers = motionPlans.filter(action => action.payloadStartM);
  assert.ok(Math.max(...motionPlans.map(vehicleActionDurationSeconds)) / MATERIAL_TIME_COMPRESSION < 80);
  for (const action of loadedCarriers) {
    const initialPose = vehicleActionAt(action, 0);
    assert.deepEqual(vehiclePayloadPoseAt(action, initialPose, 0.7), action.payloadStartM);
    const handoffPose = vehicleActionAt(action, vehicleActionDurationSeconds(action) + 1);
    assert.deepEqual(vehiclePayloadPoseAt(action, handoffPose, 0.7), action.payloadDropM);
  }
  assert.deepEqual(cargoUnloadingPoseAt(0), {
    xM: 311, yM: 5.8, zM: -331, heading: 0, phase: 'waiting',
  });
});
