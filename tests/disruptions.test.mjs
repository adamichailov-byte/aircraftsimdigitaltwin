import test from 'node:test';
import assert from 'node:assert/strict';
import {FleetEngine,fleetFixture} from '../src/simulation/flow.ts';
import {inspectionFails} from '../src/simulation/disruptions.ts';

function advanceUntil(engine,predicate){
  let guard=0,snapshot=engine.getSnapshot();
  while(snapshot.nextEventInstant!==null&&!predicate(snapshot)){
    assert.ok(++guard<10000,'fixture made bounded progress');
    engine.advanceTo(snapshot.nextEventInstant);
    snapshot=engine.getSnapshot();
  }
  return snapshot;
}

test('wing-crane outage holds Bay02, resumes the same work and records one plant outage',()=>{
  const engine=new FleetEngine(fleetFixture('wing-crane-outage'));
  const snapshot=advanceUntil(engine,s=>s.aircraft.some(a=>a.pilot.tasks.some(t=>t.taskId==='wings'&&t.state==='paused-equipment')));
  const plane=snapshot.aircraft[0],wings=plane.pilot.tasks.find(t=>t.taskId==='wings');
  assert.equal(plane.slot,'bay-2');assert.ok(wings.remainingWorkMs>0);assert.match(wings.resourceBlockers.join(' '),/wing crane outage recovery/i);
  assert.equal(snapshot.history.filter(e=>e.kind==='equipment-outage-started').length,1);
  const resumed=advanceUntil(engine,s=>s.aircraft[0].pilot.tasks.some(t=>t.taskId==='wings'&&t.state==='running'
    &&t.startedAt!==null&&t.remainingWorkMs<wings.remainingWorkMs));
  assert.equal(resumed.aircraft[0].slot,'bay-2');
  assert.ok(resumed.history.some(e=>e.kind==='task-resumed'&&e.taskId==='wings'));
});

test('seeded structure failure schedules local repair and reinspection in repeatable fleet runs',()=>{
  const config=fleetFixture('inspection-rework'),first=new FleetEngine(config,'quality-a'),second=new FleetEngine(config,'quality-b');
  const done=s=>s.aircraft[0]?.pilot.tasks.some(t=>t.qualityStatus==='repair'&&t.state==='running');
  const a=advanceUntil(first,done),b=advanceUntil(second,done);
  assert.equal(inspectionFails(208,'A100-001','inspect-structure',1,.5),true);
  assert.equal(inspectionFails(208,'A100-001','inspect-structure',2,.5),false);
  assert.equal(a.aircraft[0].slot,'bay-2');assert.ok(a.aircraft[0].pilot.tasks.some(t=>t.qualityStatus==='failed'));
  assert.equal(a.aircraft[0].pilot.tasks.find(t=>t.taskId==='inspect-structure/repair-1').state,'running');
  assert.deepEqual(first.getEvents().map(e=>[e.kind,e.instant,e.taskId,e.label]),second.getEvents().map(e=>[e.kind,e.instant,e.taskId,e.label]));
  const pass=advanceUntil(first,s=>s.aircraft[0]?.pilot.tasks.some(t=>t.taskId==='inspect-structure/recheck-2'&&t.qualityStatus==='passed'));
  assert.ok(pass.aircraft[0].pilot.tasks.find(t=>t.taskId==='bay-2-to-3').waitingFor.length===0);
  assert.equal(first.getEvents().filter(e=>e.kind==='inspection-failed').length,1);
  assert.equal(first.getEvents().filter(e=>e.kind==='material-issued'&&e.taskId==='wings').length,1,
    'repair does not issue the installed wing kit again');
});

test('zero-probability inspection plan never creates an inspection failure',()=>{
  for(let seed=0;seed<32;seed++)assert.equal(inspectionFails(seed,'A100-001','inspect-structure',1,0),false);
});

test('wing-crane outage does not interrupt an unrelated aircraft tow already in motion',()=>{
  const base=fleetFixture('baseline',1),start=base.recipe.start,config={...base,resources:{...base.resources,
    outages:[{id:'wing-crane-repair',equipmentId:'wing-crane',start:start+1,end:start+3600000}]}};
  const engine=new FleetEngine(config,'transfer-outage');
  const transfer=engine.getSnapshot().transfers[0];assert.ok(transfer);
  engine.advanceTo(start+1);
  assert.equal(engine.getSnapshot().transfers.length,1,'unrelated tow remains in motion during crane downtime');
  engine.advanceTo(transfer.end);
  assert.ok(engine.getEvents().some(event=>event.kind==='transfer-arrived'));
  assert.equal(engine.getEvents().filter(event=>event.kind==='task-paused').length,0);
});
