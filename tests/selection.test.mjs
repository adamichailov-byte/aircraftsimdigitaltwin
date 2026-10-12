import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectableEntities, isSelectionClick, selectEntityById } from '../src/demo/entities.ts';

test('canvas and list identity resolves to one entity and its work area', () => {
  for (const kind of ['aircraft', 'machine', 'rack', 'person', 'vehicle']) {
    const entities = inspectableEntities.filter(entity => entity.kind === kind);
    assert.ok(entities.length >= 2, `${kind} has two inspectable objects`);
    for (const entity of entities) {
      assert.deepEqual(selectEntityById(entity.id), { zoneId: entity.zoneId, entityId: entity.id });
      assert.ok(entity.details.length >= 3);
    }
  }
  assert.equal(selectEntityById('missing'), null);
  assert.equal(new Set(inspectableEntities.map(entity => entity.id)).size, inspectableEntities.length);
});

test('dragging or panning over an object does not select it', () => {
  assert.equal(isSelectionClick(0, 2), true);
  assert.equal(isSelectionClick(0, 6), false);
  assert.equal(isSelectionClick(2, 0), false);
});
