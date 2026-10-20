import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceFocus,
  cancelFocus,
  cameraTargetMoved,
  fitCameraToBounds,
  fitCameraToObject,
  focusTo,
  moveFocusWithTarget,
  syncFocusPose,
} from '../src/scene/camera-focus.ts';
import { chooseBannerIds } from '../src/scene/label-priority.ts';

const overview = {
  position: [800, 950, 1150],
  target: [0, 8, 0],
};
const bayOne = {
  position: [120, 100, 210],
  target: [-184, 8, -145],
};
const bayTwo = {
  position: [-40, 110, 235],
  target: [-40, 8, -145],
};

test('focus eases from the current camera pose to the requested pose', () => {
  const moving = focusTo({ pose: overview, transition: null }, bayOne, 100, 700);
  assert.deepEqual(advanceFocus(moving, 100).state.pose, overview);
  const middle = advanceFocus(moving, 450);
  assert.equal(middle.completed, false);
  assert.notDeepEqual(middle.state.pose.position, overview.position);
  assert.deepEqual(advanceFocus(middle.state, 900).state.pose, bayOne);
});

test('a newer zone selection retargets from the in-flight pose and wins', () => {
  const first = focusTo({ pose: overview, transition: null }, bayOne, 0, 700);
  const inFlight = advanceFocus(first, 260).state;
  const second = focusTo(inFlight, bayTwo, 260, 700);
  assert.deepEqual(second.pose, inFlight.pose);
  assert.deepEqual(advanceFocus(second, 960).state.pose, bayTwo);
});

test('manual camera input freezes the current interpolated pose', () => {
  const moving = focusTo({ pose: overview, transition: null }, bayOne, 0, 700);
  const stopped = cancelFocus(moving, 300);
  const frozenPose = stopped.pose;
  assert.equal(stopped.transition, null);
  assert.deepEqual(advanceFocus(stopped, 1200).state.pose, frozenPose);
});

test('manual camera movement becomes the start pose for later input and focus', () => {
  const focused = { position: [140, 120, 230], target: [-184, 8, -145] };
  const panned = { position: [160, 120, 230], target: [-164, 8, -145] };
  const synchronized = syncFocusPose(panned);
  assert.deepEqual(synchronized.pose, panned);
  assert.equal(synchronized.transition, null);
  const nextFocus = focusTo(synchronized, bayTwo, 100);
  assert.deepEqual(nextFocus.pose, panned);
});

test('selection clears after real target movement, not a stationary press or camera orbit', () => {
  assert.equal(cameraTargetMoved(overview.target, overview.target), false);
  assert.equal(cameraTargetMoved(overview.target, [0, 8.02, 0]), false);
  assert.equal(cameraTargetMoved(overview.target, [0, 8, 2]), true);
});

test('reduced-motion focus moves immediately without a transition', () => {
  const focused = focusTo({ pose: overview, transition: null }, bayOne, 50, 700, true);
  assert.deepEqual(focused.pose, bayOne);
  assert.equal(focused.transition, null);
});

test('focus framing reserves space for the process panel', () => {
  const centered = fitCameraToBounds([-40, -145], [60, 60], 1440, 836, 0);
  const panelAware = fitCameraToBounds([-40, -145], [60, 60], 1440, 836, 252);
  assert.ok(panelAware.distance > centered.distance);
  assert.ok(panelAware.target[0] < centered.target[0] || panelAware.target[2] !== centered.target[2]);
});

test('inspection framing reserves the right panel and balances both panel offsets', () => {
  const clear = fitCameraToBounds([-40, -145], [82, 82], 1280, 800, 0);
  const right = fitCameraToBounds([-40, -145], [82, 82], 1280, 800, 0, 40, undefined, 320);
  const balanced = fitCameraToBounds([-40, -145], [82, 82], 1280, 800, 252, 40, undefined, 252);
  assert.ok(right.distance > clear.distance);
  assert.ok(right.target[0] > clear.target[0]);
  assert.deepEqual(balanced.target, clear.target);
});

test('moving-object focus uses a close inspection distance instead of the whole logistics zone', () => {
  const vehicle = fitCameraToObject([-490, 0.7, -307], [4.5, 3.5, 2.4], 1280, 800, 0, 40, undefined, 320);
  const zone = fitCameraToBounds([0, -335], [1100, 120], 1280, 800, 0, 40, undefined, 320);
  assert.ok(vehicle.distance >= 55 && vehicle.distance <= 70);
  assert.ok(vehicle.distance < zone.distance / 10);
  assert.equal(vehicle.target[1], 2.1);
});

test('tracked camera translation follows a moving target without changing its viewing offset', () => {
  const state = focusTo({ pose: overview, transition: null }, bayOne, 100, 700);
  const shifted = moveFocusWithTarget(state, [18, 0, -9]);
  assert.deepEqual(shifted.transition.from.position, [818, 950, 1141]);
  assert.deepEqual(shifted.transition.to.target, [-166, 8, -154]);
  const completed = moveFocusWithTarget({ pose: bayOne, transition: null }, [-7, 0, 12]);
  assert.deepEqual(completed.pose.position, [113, 100, 222]);
  assert.deepEqual(completed.pose.target, [-191, 8, -133]);
});

test('compact inspection framing keeps the tracked vehicle above the inspector sheet', () => {
  const compact = fitCameraToObject([-490, 0.7, -307], [4.5, 3.5, 2.4], 691, 768);
  const wide = fitCameraToObject([-490, 0.7, -307], [4.5, 3.5, 2.4], 1280, 800);
  assert.ok(compact.target[1] < wide.target[1]);
  assert.equal(wide.target[1], 2.1);
});

test('selected banner wins a collision and remaining labels keep clear space', () => {
  const candidates = [
    { id: 'overview', x: 100, y: 100, width: 110, height: 36, priority: 0 },
    { id: 'selected', x: 110, y: 102, width: 110, height: 36, priority: 8 },
    { id: 'nearby', x: 260, y: 100, width: 110, height: 36, priority: 1 },
  ];
  assert.deepEqual(chooseBannerIds(candidates, 'selected', 8, 400, 300), ['selected', 'nearby']);
});
