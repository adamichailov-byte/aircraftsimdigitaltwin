import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraftAlert} from '../src/simulation/alerts.ts';

test('aircraft alert summarizes material, crew, equipment, and flow blockers without inventing a reason',()=>{
  assert.equal(aircraftAlert([]),null);
  assert.deepEqual(aircraftAlert(['Waiting for material · engine · need 2, available 1']),
    {kind:'parts',label:'PARTS',detail:'engine · need 2, available 1'});
  assert.deepEqual(aircraftAlert(['Waiting for quality crew · need 2, available 0']),
    {kind:'crew',label:'CREW',detail:'quality crew · need 2, available 0'});
  assert.deepEqual(aircraftAlert(['Waiting for lift equipment · need 1, available 0']),
    {kind:'equipment',label:'EQUIPMENT',detail:'lift equipment · need 1, available 0'});
  assert.deepEqual(aircraftAlert(['Quality hold · Reinspect structure at bay-2']),
    {kind:'quality',label:'QUALITY HOLD',detail:'Reinspect structure at bay-2'});
  assert.deepEqual(aircraftAlert(['Waiting for downstream space · Bay 04 · A100-001']),
    {kind:'flow',label:'FLOW',detail:'downstream space · Bay 04 · A100-001'});
});

test('behind-plan activity is surfaced on the aircraft alert even without a current blocker',()=>{
  assert.deepEqual(aircraftAlert([],2),{kind:'schedule',label:'BEHIND PLAN',detail:'2 activities overdue'});
  assert.deepEqual(aircraftAlert(['Waiting for material · engine · need 2, available 1'],1),
    {kind:'parts',label:'PARTS · 1 LATE',detail:'engine · need 2, available 1; 1 scheduled activity overdue'});
});

test('schedule lateness is visible on an aircraft even when it has no active blocker',()=>{
  assert.deepEqual(aircraftAlert([],2),{kind:'schedule',label:'BEHIND PLAN',detail:'2 activities overdue'});
  assert.deepEqual(aircraftAlert(['Waiting for material · engine · need 2, available 1'],1),
    {kind:'parts',label:'PARTS · 1 LATE',detail:'engine · need 2, available 1; 1 scheduled activity overdue'});
});
