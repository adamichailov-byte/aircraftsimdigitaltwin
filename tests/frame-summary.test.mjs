import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFrames } from '../src/scene/frame-summary.ts';

test('FPS uses complete intervals without counting an extra initial frame', () => {
  const report = summarizeFrames(Array(300).fill(100));
  assert.equal(report.seconds, 30);
  assert.equal(report.frames, 300);
  assert.equal(report.fps, 10);
});

test('a long render stall remains in frame-time and FPS statistics', () => {
  const report = summarizeFrames([...Array(18).fill(10), 100, 200]);
  assert.equal(report.p95Ms, 100);
  assert.equal(report.worstMs, 200);
  assert.ok(Math.abs(report.fps - 20 / 0.48) < 0.0001);
});

test('empty and invalid intervals cannot produce an infinite frame rate', () => {
  assert.deepEqual(summarizeFrames([0, -1, NaN, Infinity]),
    { frames: 0, seconds: 0, fps: 0, p95Ms: 0, worstMs: 0 });
});
