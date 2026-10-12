import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraCommandForKey } from '../src/scene/camera-keyboard.ts';

test('WASD starts and continues camera-relative movement regardless of letter case', () => {
  assert.deepEqual(cameraCommandForKey('w'), { type: 'keyboard-pan', key: 'w' });
  assert.deepEqual(cameraCommandForKey('A'), { type: 'keyboard-pan', key: 'a' });
  assert.deepEqual(cameraCommandForKey('s'), { type: 'keyboard-pan', key: 's' });
  assert.deepEqual(cameraCommandForKey('d'), { type: 'keyboard-pan', key: 'd' });
});

test('existing keyboard camera controls remain available', () => {
  assert.deepEqual(cameraCommandForKey('ArrowLeft'), { type: 'move', action: 'left' });
  assert.deepEqual(cameraCommandForKey('ArrowUp'), { type: 'move', action: 'up' });
  assert.deepEqual(cameraCommandForKey('Home'), { type: 'home' });
  assert.deepEqual(cameraCommandForKey('-'), { type: 'move', action: 'out' });
  assert.equal(cameraCommandForKey('q'), null);
});
