import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskEngine, PilotSession } from '../src/simulation/engine.ts';
import { compileCalendar, defaultCalendar, localInstant } from '../src/simulation/calendar.ts';
import { bay01Pilot as a100Pilot } from '../src/simulation/fixtures/a100.ts';
import { demoClock } from '../src/demo/clock.ts';
import { ResourceManager } from '../src/simulation/resources.ts';

const H = 3_600_000, at = local => localInstant(local, 'America/New_York');
const calendar = compileCalendar(defaultCalendar, '2027-01-04', '2027-01-12');
const task = (id, prerequisites = [], durationMs = H) => ({id,label:id,prerequisites,durationMs,
  crewRequirements:{},materialRequirements:{},completionMilestones:[]});
const config = (tasks, start = at('2027-01-04T06:00')) => ({calendar,start,end:calendar.end,
  serialId:'TEST-001',tasks,availability:'assumed-abundant'});

test('two dependent 60-minute tasks cannot overlap and expose unmet prerequisites', () => {
  const engine = new TaskEngine(config([task('a'),task('b',['a'])]),'same-run');
  assert.deepEqual(engine.getSnapshot().tasks[1].waitingFor,['a']);
  engine.advanceTo(at('2027-01-04T06:30'));
  assert.equal(engine.getSnapshot().tasks[0].remainingWorkMs,H/2);
  assert.equal(engine.getSnapshot().tasks[1].startedAt,null);
  engine.advanceTo(at('2027-01-04T08:00'));
  engine.pauseUnavailableEquipment('outage-start');
  const [a,b] = engine.getSnapshot().tasks;
  assert.equal(a.completedAt,at('2027-01-04T07:00'));
  assert.equal(b.startedAt,a.completedAt);
  assert.equal(b.completedAt,at('2027-01-04T08:00'));
  assert.deepEqual(engine.getSnapshot().history.filter(e=>e.instant===a.completedAt).map(e=>e.kind),['task-completed','task-started']);
  assert.equal(engine.getSnapshot().status,'complete');
  assert.equal(engine.getSnapshot().nextEventInstant,null);
});

test('independent tasks run concurrently under the explicit abundant-capacity assumption', () => {
  const engine=new TaskEngine(config([task('b'),task('a')]),'same-run');
  assert.deepEqual(engine.getSnapshot().history.filter(e=>e.kind==='task-started').map(e=>e.payload.taskId),['a','b']);
  engine.advanceTo(at('2027-01-04T07:00'));
  assert.ok(engine.getSnapshot().tasks.every(t=>t.completedAt===at('2027-01-04T07:00')));
});

test('completion precedes calendar changes and dispatch at an exact break or shift boundary', () => {
  const engine=new TaskEngine(config([task('a'),task('b',['a'])],at('2027-01-04T09:00')),'same-run');
  engine.advanceTo(at('2027-01-04T10:00'));
  assert.equal(engine.getSnapshot().tasks[0].state,'complete');
  assert.equal(engine.getSnapshot().tasks[1].startedAt,null);
  assert.deepEqual(engine.getSnapshot().history.filter(e=>e.instant===at('2027-01-04T10:00')).map(e=>e.kind),['task-completed','calendar-boundary']);
  engine.advanceTo(at('2027-01-04T11:30'));
  assert.equal(engine.getSnapshot().tasks[1].completedAt,at('2027-01-04T11:30'));
  const shiftEnd=new TaskEngine(config([task('a'),task('b',['a'])],at('2027-01-04T21:00')));
  shiftEnd.advanceTo(at('2027-01-05T07:00'));
  assert.equal(shiftEnd.getSnapshot().tasks[0].completedAt,at('2027-01-04T22:00'));
  assert.equal(shiftEnd.getSnapshot().tasks[1].startedAt,at('2027-01-05T06:00'));
});

test('progress freezes through a break, preserves work and records resume', () => {
  const engine=new TaskEngine(config([task('a',[],2*H)],at('2027-01-04T09:00')));
  engine.advanceTo(at('2027-01-04T10:15'));
  assert.equal(engine.getSnapshot().tasks[0].state,'paused-off-shift');
  assert.equal(engine.getSnapshot().tasks[0].remainingWorkMs,H);
  engine.advanceTo(at('2027-01-04T10:30'));
  assert.equal(engine.getSnapshot().tasks[0].state,'running');
  assert.equal(engine.getSnapshot().tasks[0].remainingWorkMs,H);
  engine.advanceTo(at('2027-01-04T11:30'));
  assert.equal(engine.getSnapshot().tasks[0].state,'complete');
});

test('equipment outage pauses only dependent work, preserves remaining effort and invalidates stale completion',()=>{
  const start=at('2027-01-04T06:00'),outageEnd=at('2027-01-04T09:30');
  const manager=new ResourceManager({crewsByShift:{'Shift 1':{systems:2},'Shift 2':{systems:2}},equipment:{'wing-crane':1},
    outages:[{id:'wing-crane-repair',equipmentId:'wing-crane',start:at('2027-01-04T08:00'),end:outageEnd}]},calendar);
  const resources={blockers:(t,n)=>manager.blockers(t,n),canEverAcquire:t=>manager.canEverAcquire(t),
    acquire:(t,id,n)=>manager.acquire(t,id,n),release:(t,id,n,keep,c)=>manager.release(t,id,n,keep,c),
    outageBlockers:(t,n)=>manager.outageBlockers(t,n),nextOutageBoundary:n=>manager.nextOutageBoundary(n),
    outageTransitions:n=>manager.outageTransitions(n)};
  const engine=new TaskEngine(config([{
    ...task('wings',[],4*H),crewRequirements:{systems:1},equipmentRequirements:{'wing-crane':1}},
    {...task('wiring',[],4*H),crewRequirements:{systems:1}}],start),'outage-run',()=>true,undefined,resources);
  engine.advanceTo(at('2027-01-04T08:00'));
  engine.pauseUnavailableEquipment('outage-start');
  const paused=engine.getSnapshot().tasks.find(t=>t.taskId==='wings');
  assert.equal(paused.state,'paused-equipment');assert.equal(paused.remainingWorkMs,2*H);
  assert.match(paused.resourceBlockers.join(' '),/outage recovery/i);
  engine.advanceTo(outageEnd);
  engine.redispatch();
  assert.equal(engine.getSnapshot().tasks.find(t=>t.taskId==='wings').state,'running');
  assert.equal(engine.getSnapshot().tasks.find(t=>t.taskId==='wings').completedAt,null,'old 10:00 completion is stale');
  engine.advanceTo(at('2027-01-04T10:00'));
  assert.equal(engine.getSnapshot().tasks.find(t=>t.taskId==='wings').state,'paused-off-shift');
  assert.equal(engine.getSnapshot().tasks.find(t=>t.taskId==='wiring').completedAt,at('2027-01-04T10:00'));
  engine.advanceTo(at('2027-01-04T12:00'));
  assert.equal(engine.getSnapshot().tasks.find(t=>t.taskId==='wings').completedAt,at('2027-01-04T12:00'));
});

test('work completing exactly when an outage starts remains complete',()=>{
  const start=at('2027-01-04T06:00'),outageStart=at('2027-01-04T07:00');
  const manager=new ResourceManager({crewsByShift:{'Shift 1':{systems:1},'Shift 2':{systems:1}},equipment:{'wing-crane':1},
    outages:[{id:'crane-repair',equipmentId:'wing-crane',start:outageStart,end:at('2027-01-04T09:00')}]},calendar);
  const resources={blockers:(t,n)=>manager.blockers(t,n),canEverAcquire:t=>manager.canEverAcquire(t),
    acquire:(t,id,n)=>manager.acquire(t,id,n),release:(t,id,n,keep,c)=>manager.release(t,id,n,keep,c),
    outageBlockers:(t,n)=>manager.outageBlockers(t,n),nextOutageBoundary:n=>manager.nextOutageBoundary(n),
    outageTransitions:n=>manager.outageTransitions(n)};
  const engine=new TaskEngine(config([{...task('fit',[],H),crewRequirements:{systems:1},equipmentRequirements:{'wing-crane':1}}],start),
    'boundary-run',()=>true,undefined,resources);
  engine.advanceTo(outageStart);
  assert.equal(engine.getSnapshot().tasks[0].state,'complete');
  engine.pauseUnavailableEquipment('crane-repair-start');
  assert.equal(engine.getSnapshot().tasks[0].state,'complete');
  assert.equal(engine.getSnapshot().history.filter(event=>event.kind==='task-paused').length,0);
});

test('seeded inspection failures add bounded repair/reinspection and hold downstream work after the cap',()=>{
  const tasks=[{...task('inspect'),qualityCheck:{repairCrewRequirements:{systems:2}}},task('next',['inspect'])];
  const quality={seed:13,failureProbabilityByTask:{inspect:1},maxRepairCycles:2};
  const make=()=>new TaskEngine(config(tasks),'quality-run',()=>true,undefined,undefined,{quality});
  const first=make(),second=make();first.advanceTo(at('2027-01-07T06:00'));second.advanceTo(at('2027-01-07T06:00'));
  assert.deepEqual(first.getSnapshot().history,second.getSnapshot().history);
  const snapshot=first.getSnapshot();
  assert.equal(snapshot.history.filter(event=>event.kind==='inspection-failed').length,3);
  assert.equal(snapshot.history.filter(event=>event.kind==='rework-scheduled').length,2);
  assert.equal(snapshot.tasks.filter(task=>task.qualityStatus==='repair').length,2);
  assert.equal(snapshot.tasks.find(task=>task.taskId==='inspect/recheck-3').state,'quality-hold');
  assert.deepEqual(snapshot.tasks.find(task=>task.taskId==='next').waitingFor,['inspect/recheck-3']);
});

test('whole run, event stepping and arbitrary display sampling produce identical causal history', () => {
  const make=()=>new TaskEngine(a100Pilot,'same-run');
  const whole=make(), stepped=make(), sampled=make();
  whole.advanceTo(a100Pilot.end);
  let guard=0;
  while(stepped.getSnapshot().nextEventInstant!==null) {
    assert.ok(++guard<1000); stepped.advanceTo(stepped.getSnapshot().nextEventInstant);
  }
  for(let instant=a100Pilot.start+13*60_000;instant<a100Pilot.start+3*86400_000;instant+=13*60_000) sampled.advanceTo(instant);
  assert.deepEqual(stepped.getSnapshot().history,whole.getSnapshot().history);
  assert.deepEqual(sampled.getSnapshot().history,whole.getSnapshot().history);
  const history=whole.getSnapshot().history;
  for(const event of history) for(const cause of event.causeEventIds) assert.ok(history.some(e=>e.id===cause && e.sequence<event.sequence));
  assert.equal(whole.getSnapshot().tasks[0].completedAt,at('2027-01-04T14:30'));
  assert.equal(whole.getSnapshot().tasks[1].completedAt,at('2027-01-05T15:30'));
  assert.equal(whole.getSnapshot().tasks[2].completedAt,at('2027-01-05T20:00'));
});

test('cycles, unknown prerequisites, duplicates and invalid durations fail explicitly', () => {
  for(const tasks of [[task('a',['b']),task('b',['a'])],[task('a',['missing'])],[task('a'),task('a')],[task('a',[],0)]]) {
    assert.throws(()=>new TaskEngine(config(tasks)),RangeError);
  }
});

test('empty queue, no working calendar, finite horizon and immutable snapshots are bounded', () => {
  const empty=new TaskEngine(config([]));
  assert.equal(empty.getSnapshot().status,'complete');
  assert.equal(empty.getSnapshot().nextEventInstant,null);
  const closed=compileCalendar({...defaultCalendar,shifts:[]},'2027-01-04','2027-01-06');
  const blocked=new TaskEngine({...config([task('a')]),calendar:closed,end:closed.end});
  assert.equal(blocked.getSnapshot().status,'blocked');
  assert.equal(blocked.getSnapshot().nextEventInstant,null);
  const short=new TaskEngine({...config([task('a',[],2*H)]),end:at('2027-01-04T07:00')});
  assert.equal(short.getSnapshot().status,'active');
  short.advanceTo(at('2027-01-04T07:00'));
  assert.equal(short.getSnapshot().status,'horizon-reached');
  assert.equal(short.getSnapshot().tasks[0].remainingWorkMs,H);
  assert.throws(()=>short.advanceTo(at('2027-01-04T06:00')),RangeError);
  assert.throws(()=>short.getSnapshot().tasks.push(task('bad')),TypeError);
  const boundary=new TaskEngine({...config([task('a'),task('b',['a'])]),end:at('2027-01-04T07:00')});
  boundary.advanceTo(at('2027-01-04T07:00'));
  assert.equal(boundary.getSnapshot().tasks[0].state,'complete');
  assert.equal(boundary.getSnapshot().tasks[1].startedAt,null);
});

test('pilot reset starts a new run even while paused and stepping never drives the legacy clock', () => {
  const scriptedSnapshot=demoClock.getSnapshot(), scriptedTime=demoClock.getElapsedSeconds();
  let wall=0;
  const session=new PilotSession(a100Pilot,()=>wall);
  session.nextEvent();
  assert.equal(session.getSnapshot().instant,at('2027-01-04T10:00'));
  assert.equal(session.getSnapshot().tasks[0].remainingWorkMs,4*H);
  session.clock.setPlaying(true);wall=1000;session.clock.tick();
  assert.equal(session.getSnapshot().instant,at('2027-01-04T11:00'));
  assert.equal(session.getSnapshot().tasks[0].remainingWorkMs,3.5*H);
  session.reset();const first=session.getSnapshot().runId;
  session.reset();
  assert.notEqual(session.getSnapshot().runId,first);
  assert.equal(session.getSnapshot().instant,a100Pilot.start);
  assert.equal(session.getSnapshot().tasks[0].remainingWorkMs,8*H);
  assert.equal(session.clock.getSnapshot().playing,false);
  assert.deepEqual(session.getSnapshot().aircraft.completedMilestones,[]);
  assert.equal(demoClock.getSnapshot(),scriptedSnapshot);
  assert.equal(demoClock.getElapsedSeconds(),scriptedTime);
});
