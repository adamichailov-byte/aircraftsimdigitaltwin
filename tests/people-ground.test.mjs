import test from 'node:test';
import assert from 'node:assert/strict';
import { technicianGroundContact } from '../src/models/people-ground.ts';

test('technician feet meet the raised hall and support-building slab', () => {
  const contact = technicianGroundContact();
  assert.equal(contact.rootY, 0.7);
  assert.ok(contact.clearance >= 0 && contact.clearance <= 0.03,
    `feet should touch the 0.7 m slab, clearance was ${contact.clearance} m`);
});
