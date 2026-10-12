import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLengthM, siteRoutes } from '../src/demo/routes.ts';
import { deliveryStands } from '../src/demo/campus.ts';

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared));
  return Math.hypot(point[0] - start[0] - projection * dx, point[1] - start[1] - projection * dz);
}

test('logistics routes have usable lengths, widths, and dwell points on their paths', () => {
  for (const route of siteRoutes) {
    assert.ok(routeLengthM(route) > 0, `${route.id} has a path`);
    assert.ok(route.clearWidthM >= 6, `${route.id} has a defined clear width`);
    for (const dwell of route.dwellPointsM) {
      assert.ok(route.pointsM.some((point, index) => index > 0
        && distanceToSegment(dwell, route.pointsM[index - 1], point) < 1), `${route.id} dwell point sits on route`);
    }
  }
});

test('pedestrian crossings coincide with an authored walkway and the tow route reaches the open delivery stand', () => {
  const walks = siteRoutes.filter(route => route.mode === 'pedestrian');
  for (const route of siteRoutes.filter(candidate => candidate.mode !== 'pedestrian')) {
    for (const crossing of route.crossings.filter(item => item.yieldTo === 'pedestrians')) {
      assert.ok(walks.some(walk => walk.pointsM.some((point, index) => index > 0
        && distanceToSegment(crossing.pointM, walk.pointsM[index - 1], point) < 1)), crossing.label);
    }
  }
  const tow = siteRoutes.find(route => route.id === 'hall-to-delivery');
  assert.ok(tow);
  assert.ok(tow.clearWidthM >= 60, 'tow route accommodates the nominal aircraft width');
  assert.deepEqual(tow.pointsM.at(-1), deliveryStands.at(-1));
});
