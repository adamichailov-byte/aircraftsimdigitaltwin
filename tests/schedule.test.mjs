import test from 'node:test';
import assert from 'node:assert/strict';
import {FleetEngine,fleetFixture} from '../src/simulation/flow.ts';
import {activityId,activityTimes,lateAircraftActivities,masterPlan,receivingQueue,scheduleState} from '../src/simulation/schedule.ts';

test('capacity plan matches execution including intake tows and never populates future actual work',()=>{
  const config=fleetFixture('baseline',5),reference=new FleetEngine(config,'plan');reference.advanceTo(config.recipe.end);
  const plan=masterPlan(config,reference.getEvents(),reference.getSnapshot());
  const actual=new FleetEngine(config,'live'),initial=actual.getSnapshot(),times=activityTimes(actual.getEvents());
  assert.equal(initial.instant,config.recipe.start);assert.equal(initial.delivered,0);
  const intake=plan.activities.find(r=>r.owner==='A100-001'&&r.id.endsWith('/intake'));
  assert.ok(intake);assert.ok(intake.resources.includes('tow-tug ×1'));assert.ok(intake.finish>intake.start);
  assert.ok(plan.activities.some(r=>r.kind==='receiving'&&r.resources.includes('kit-forklift ×1')));
  assert.equal(plan.activities.filter(row=>scheduleState(row,times[row.id],initial.instant).state==='overdue').length,0);
  actual.advanceTo(config.recipe.end);const completed=activityTimes(actual.getEvents());
  assert.deepEqual(completed,activityTimes(reference.getEvents()));
  assert.equal(plan.activities.filter(row=>scheduleState(row,completed[row.id],config.recipe.end).late).length,0);
  assert.ok(Object.keys(completed).length>actual.getSnapshot().history.length);
  assert.deepEqual(plan,masterPlan(config,actual.getEvents(),actual.getSnapshot()));
});

test('missed starts and finishes use strict due boundaries; completed late stays late',()=>{
  const row={id:'x',owner:'plane',kind:'aircraft',label:'work',station:'bay',resources:[],start:100,finish:200};
  assert.equal(scheduleState(row,undefined,100).state,'planned');
  assert.equal(scheduleState(row,undefined,101).state,'overdue');
  assert.equal(scheduleState(row,{start:100,finish:null},200).state,'active');
  assert.equal(scheduleState(row,{start:100,finish:null},201).state,'overdue');
  assert.deepEqual(scheduleState(row,{start:130,finish:null},150),{state:'overdue',late:true,delay:30},'a late start stays flagged while catching up');
  assert.equal(scheduleState(row,{start:130,finish:190},500).late,false,'completion within the target clears a recovered delay');
  assert.deepEqual(scheduleState(row,{start:100,finish:230},500),{state:'complete',late:true,delay:30});
  assert.equal(scheduleState({...row,start:null,finish:null},undefined,500).state,'planned');
});

test('selected aircraft can enumerate only its late activities, including late completions',()=>{
  const activities=[
    {id:'aircraft/A100-001/late-running',owner:'A100-001',kind:'aircraft',label:'Fit wings',station:'Bay 02',resources:[],start:100,finish:200},
    {id:'aircraft/A100-001/late-complete',owner:'A100-001',kind:'aircraft',label:'Inspect wings',station:'Bay 02',resources:[],start:50,finish:90},
    {id:'aircraft/A100-002/on-time',owner:'A100-002',kind:'aircraft',label:'Fit wings',station:'Bay 02',resources:[],start:100,finish:200},
  ];
  const plan={activities};
  const late=lateAircraftActivities(plan,{
    [activities[0].id]:{start:150,finish:null},
    [activities[1].id]:{start:50,finish:120},
    [activities[2].id]:{start:null,finish:null},
  },250,'A100-001');
  assert.deepEqual(late.map(item=>[item.row.label,item.status.state,item.status.delay]),[
    ['Fit wings','overdue',50],['Inspect wings','complete',30],
  ]);
});

test('delayed inspection misses a frozen nominal deadline and propagates to the engine task',()=>{
  const config=fleetFixture('receiving-demo'),reference=new FleetEngine({...config,...config.scheduleReference},'reference');
  reference.advanceTo(config.recipe.end);const plan=masterPlan(config,reference.getEvents(),reference.getSnapshot()),frozen=JSON.stringify(plan);
  const receipt=config.materials.receipts[0],actual=new FleetEngine(config,'actual');
  actual.advanceTo(receipt.at+60000);let times=activityTimes(actual.getEvents());
  const inspection=plan.activities.find(r=>r.id===activityId('receiving',receipt.id,'inspection'));
  assert.equal(inspection.start,receipt.at);assert.equal(scheduleState(inspection,times[inspection.id],actual.getSnapshot().instant).state,'overdue');
  actual.advanceTo(config.recipe.end);times=activityTimes(actual.getEvents());
  const engine=plan.activities.find(r=>r.id===activityId('aircraft','A100-001','engines'));
  assert.ok(times[engine.id].start>engine.start);assert.ok(times[engine.id].finish>engine.finish);
  assert.ok(scheduleState(inspection,times[inspection.id],config.recipe.end).late);
  assert.equal(JSON.stringify(plan),frozen,'actual execution must never move the original plan');
});

test('scheduled equipment outage is a master-schedule activity with exact actual boundaries',()=>{
  const config=fleetFixture('wing-crane-outage'),reference=new FleetEngine({...config,...config.scheduleReference},'nominal');
  reference.advanceTo(config.recipe.end);
  const plan=masterPlan(config,reference.getEvents(),reference.getSnapshot());
  const outage=config.resources.outages[0],row=plan.activities.find(item=>item.id===activityId('equipment','wing-crane',outage.id));
  assert.ok(row);assert.equal(row.start,outage.start);assert.equal(row.finish,outage.end);
  const actual=new FleetEngine(config,'outage');actual.advanceTo(outage.start);
  let time=activityTimes(actual.getEvents())[row.id];assert.deepEqual(time,{start:outage.start,finish:null});
  assert.equal(scheduleState(row,time,outage.start).state,'active');
  actual.advanceTo(outage.end);time=activityTimes(actual.getEvents())[row.id];
  assert.deepEqual(time,{start:outage.start,finish:outage.end});
  assert.equal(scheduleState(row,time,outage.end).state,'complete');
});

test('future receipts are a visible queue and paused stage resumption retains original start',()=>{
  const config=fleetFixture(),engine=new FleetEngine(config),queue=receivingQueue(config,engine.getSnapshot());
  assert.equal(queue.length,config.materials.receipts.length);assert.ok(queue.length>0);
  assert.ok(queue.every(q=>q.job===undefined&&q.status==='Scheduled · awaiting arrival'));
  const event=(instant,kind)=>({instant,kind,handling:{jobId:'r',stage:'transit'}});
  const times=activityTimes([event(10,'handling-started'),event(20,'handling-paused'),event(30,'handling-started'),event(40,'handling-completed')]);
  assert.deepEqual(times['receiving/r/transit'],{start:10,finish:40});
});
