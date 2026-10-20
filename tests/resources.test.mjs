import test from 'node:test';
import assert from 'node:assert/strict';
import {fleetFixture} from '../src/simulation/flow.ts';
import {ResourceManager} from '../src/simulation/resources.ts';
import {localInstant} from '../src/simulation/calendar.ts';

const baseTask=(id,crewRequirements={},equipmentRequirements={})=>({id,label:id,prerequisites:[],durationMs:3600000,
  crewRequirements,materialRequirements:{},equipmentRequirements,completionMilestones:[]});

test('crew and equipment requests allocate as one atomic fixed-unit bundle',()=>{
  const config=fleetFixture('baseline',1),manager=new ResourceManager({crewsByShift:{'Shift 1':{systems:6,quality:2},'Shift 2':{systems:6,quality:2}},equipment:{lift:1}},config.recipe.calendar);
  const instant=config.recipe.start,first=baseTask('wiring',{systems:6}),second=baseTask('hydraulics',{systems:4});
  assert.ok(manager.acquire(first,'A',instant));
  assert.deepEqual(manager.snapshot(instant).crews.find(pool=>pool.pool==='systems'),{pool:'systems',capacity:6,used:6,available:0});
  assert.match(manager.blockers(second,instant)[0],/systems crew · need 4, available 0/);
  assert.equal(manager.acquire(second,'B',instant),null);
  assert.ok(manager.release(first,'A',instant).length);
  assert.ok(manager.acquire(second,'B',instant));

  const usesLift=baseTask('lift-first',{}, {lift:1});assert.ok(manager.acquire(usesLift,'C',instant));
  const bundle=baseTask('bundle',{systems:4},{lift:1});
  assert.equal(manager.acquire(bundle,'D',instant),null);
  assert.equal(manager.snapshot(instant).crews.find(pool=>pool.pool==='systems').used,4,
    'blocked all-or-none bundle must not reserve any of its crew');
  assert.match(manager.blockers(bundle,instant).join(' '),/lift equipment · need 1, available 0/);
});

test('zero staff yields a useful impossible-capacity diagnosis and invalid capacities are rejected',()=>{
  const config=fleetFixture('baseline',1),plan={crewsByShift:{'Shift 1':{systems:0},'Shift 2':{systems:0}},equipment:{}};
  const manager=new ResourceManager(plan,config.recipe.calendar);
  const task=baseTask('systems-work',{systems:1});
  assert.equal(manager.canEverAcquire(task),false);
  assert.match(manager.blockers(task,config.recipe.start)[0],/need 1, available 0/);
  assert.throws(()=>new ResourceManager({crewsByShift:{'Shift 1':{quality:-1}},equipment:{}},config.recipe.calendar),/capacity/i);
});

test('a bundle split across different shifts is permanently impossible, and empty allocations release cleanly',()=>{
  const config=fleetFixture('baseline',1),manager=new ResourceManager({crewsByShift:{
    'Shift 1':{systems:4,quality:0},'Shift 2':{systems:0,quality:2}},equipment:{}},config.recipe.calendar);
  const impossible=baseTask('mixed-shift-work',{systems:4,quality:2});
  assert.equal(manager.canEverAcquire(impossible),false,'both skill pools must be available on one actual shift');
  const noResources=baseTask('solo-work');
  assert.equal(manager.acquire(noResources,'A',config.recipe.start),null,'unallocated work does not create a ghost lease');
  assert.equal(manager.snapshot(config.recipe.start).allocations.length,0);
  assert.deepEqual(manager.release(noResources,'A',config.recipe.start),[]);
  assert.equal(manager.snapshot(config.recipe.start).allocations.length,0,'completed work must not leave an empty lease behind');
});

test('equipment configured to stay with elapsed work remains reserved at a shift boundary',()=>{
  const config=fleetFixture('baseline',1),manager=new ResourceManager({crewsByShift:{'Shift 1':{},'Shift 2':{}},equipment:{booth:1}},config.recipe.calendar);
  const task=baseTask('cure',{}, {booth:1}),shiftEnd=localInstant('2027-01-04T14:00',config.recipe.calendar.timeZone);
  assert.ok(manager.acquire(task,'A',shiftEnd-1));
  assert.deepEqual(manager.release(task,'A',shiftEnd,true),[]);
  assert.equal(manager.snapshot(shiftEnd).equipment.find(pool=>pool.pool==='booth').used,1);
  assert.equal(manager.snapshot(shiftEnd).allocations[0].equipment[0].unit,1);
  assert.equal(manager.release(task,'A',shiftEnd+1,false).length,1);
  assert.equal(manager.snapshot(shiftEnd+1).equipment.find(pool=>pool.pool==='booth').used,0);
});

test('scheduled equipment outage blocks only dependent work and exposes the next recovery boundary',()=>{
  const config=fleetFixture('baseline',1),start=localInstant('2027-01-04T09:00',config.recipe.calendar.timeZone);
  const end=localInstant('2027-01-04T11:00',config.recipe.calendar.timeZone);
  const manager=new ResourceManager({crewsByShift:{'Shift 1':{systems:4},'Shift 2':{systems:4}},equipment:{'wing-crane':1},
    outages:[{id:'crane-repair',equipmentId:'wing-crane',start,end}]},config.recipe.calendar);
  const usesCrane=baseTask('fit-wings',{systems:4},{'wing-crane':1}),independent=baseTask('wire',{systems:4});
  assert.match(manager.blockers(usesCrane,start).join(' '),/wing crane outage/i);
  assert.deepEqual(manager.blockers(independent,start),[]);
  assert.equal(manager.nextOutageBoundary(start),end);
  assert.equal(manager.nextOutageBoundary(end),null);
  assert.throws(()=>new ResourceManager({crewsByShift:{'Shift 1':{}},equipment:{'wing-crane':1},
    outages:[{id:'bad',equipmentId:'missing',start,end}]},config.recipe.calendar),/outage/i);
});
