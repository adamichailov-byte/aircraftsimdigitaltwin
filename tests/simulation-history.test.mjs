import test from 'node:test';
import assert from 'node:assert/strict';
import {FleetEngine,fleetFixture} from '../src/simulation/flow.ts';
import {HistoryArchive,projectHistory,nearestHistoryCheckpoint,historyActivityTimes,classifyTaskTime,historyCheckpointAt} from '../src/simulation/history.ts';
import {fleetPose} from '../src/simulation/selectors.ts';

test('history projection is an exact recorded checkpoint and never changes the live engine',()=>{
  const config=fleetFixture('receiving-demo'),engine=new FleetEngine(config,'history-run'),archive=new HistoryArchive(config.eventLimit);
  archive.append(engine.getEvents());archive.record(engine.getSnapshot());
  for(let i=0;i<80&&engine.getSnapshot().nextEventInstant!==null;i++){
    engine.advanceTo(engine.getSnapshot().nextEventInstant,1);archive.append(engine.getEvents().slice(archive.snapshot(null).events.length));archive.record(engine.getSnapshot());
  }
  const checkpoint=archive.snapshot(null).checkpoints.at(-1),events=archive.snapshot(null).events;
  assert.ok(checkpoint);const expected=engine.getSnapshot(),projected=projectHistory(checkpoint,events);
  assert.equal(projected.instant,expected.instant);assert.equal(projected.digest,expected.digest);
  assert.deepEqual(projected.aircraft.map(a=>[a.id,a.slot,a.state,a.pilot.tasks]),expected.aircraft.map(a=>[a.id,a.slot,a.state,a.pilot.tasks]));
  assert.deepEqual(projected.inventory.lots,expected.inventory.lots);assert.deepEqual(projected.resources,expected.resources);
  assert.deepEqual(projected.logistics,expected.logistics);assert.equal(engine.getSnapshot().digest,expected.digest);
});

test('bounded history retains run boundaries, simultaneous causes and recorded-time actuals only',()=>{
  const config=fleetFixture('baseline',1),engine=new FleetEngine(config,'bounded-run'),archive=new HistoryArchive(2);
  archive.record(engine.getSnapshot());
  const snapshot=engine.getSnapshot();
  const pin=snapshot.instant+200;
  for(let offset=1;offset<=900;offset++)archive.record({...snapshot,instant:snapshot.instant+offset,revision:offset},pin);
  const first=archive.snapshot(null).checkpoints[0],last=archive.snapshot(null).checkpoints.at(-1);
  assert.ok(archive.snapshot(null).checkpoints.length<=128);assert.equal(first.instant,snapshot.instant);assert.equal(last.instant,snapshot.instant+900);
  assert.ok(historyCheckpointAt(archive.snapshot(null),pin),'a selected checkpoint survives history compaction');
  const causes=['receipt-event','resource-event'];
  const causality={runId:'bounded-run',sequence:1,instant:snapshot.instant+900,kind:'task-paused',serialId:'A100-001',id:'pause',entityIds:['A100-001'],
    causeEventIds:causes,payloadVersion:1,taskId:'wings',label:'Fit wings'};
  const simultaneous={...causality,id:'resource-change',sequence:2,kind:'resource-allocated',causeEventIds:['crew-a','hoist-a']};
  const beyondLimit={...causality,id:'over-limit',sequence:3,instant:snapshot.instant+901};
  archive.append([causality,causality,simultaneous,beyondLimit]);assert.equal(archive.snapshot(null).events.length,2,'the configured event guard bounds the log');
  const state=nearestHistoryCheckpoint(archive.snapshot(null),snapshot.instant+900);
  assert.ok(state);assert.equal(state.instant,snapshot.instant+900);
  const projection=projectHistory(state,archive.snapshot(null).events);
  assert.deepEqual(projection.history.slice(-2).map(event=>event.id),['pause','resource-change'],'same-instant events remain ordered in the ledger');
  assert.deepEqual(projection.history.at(-1).causeEventIds,['crew-a','hoist-a'],'overlapping causes remain individually traceable');
  assert.deepEqual(historyActivityTimes(archive.snapshot(null),snapshot.instant+899),{});
  assert.equal(nearestHistoryCheckpoint(archive.snapshot(null),-1),null,'future and pre-run times do not invent state');
});

test('overlapping blockers retain all causes while a task gets one exclusive delay class',()=>{
  const result=classifyTaskTime({state:'waiting-material',materialBlockers:['engine lot quarantined'],resourceBlockers:['engine hoist busy'],waitingFor:['wings']},['bay 4 occupied']);
  assert.equal(result.primary,'missing material');
  assert.deepEqual(result.blockers,['engine lot quarantined','engine hoist busy','bay 4 occupied','waiting for wings']);
});

test('recorded mid-task, tow and delivery states project without moving the live engine',()=>{
  const config=fleetFixture('baseline',1),engine=new FleetEngine(config,'milestone-run'),archive=new HistoryArchive(config.eventLimit);
  let copied=0;archive.record(engine.getSnapshot());
  while(engine.getSnapshot().nextEventInstant!==null){
    engine.advanceTo(engine.getSnapshot().nextEventInstant,1);
    const all=engine.getEvents();archive.append(all.slice(copied));copied=all.length;archive.record(engine.getSnapshot());
  }
  const checkpoints=archive.snapshot(null).checkpoints;
  const working=checkpoints.find(point=>point.snapshot.aircraft.some(aircraft=>aircraft.pilot.tasks.some(task=>task.state==='running')));
  const towing=checkpoints.find(point=>point.snapshot.transfers.length>0);
  const delivered=[...checkpoints].reverse().find(point=>point.snapshot.aircraft.some(aircraft=>aircraft.state==='delivered'));
  assert.ok(working&&towing&&delivered,'the run recorded productive work, an active transfer and delivery');
  for(const point of [working,towing,delivered]){
    const projected=projectHistory(point,archive.snapshot(null).events);
    assert.equal(projected.digest,point.snapshot.digest);assert.equal(projected.instant,point.instant);
  }
  const transfer=projectHistory(towing,archive.snapshot(null).events),aircraft=transfer.aircraft.find(a=>a.id==='A100-001');
  assert.ok(fleetPose(config,transfer,aircraft).visible);
  const completed=projectHistory(delivered,archive.snapshot(null).events),departed=completed.aircraft.find(a=>a.id==='A100-001');
  assert.equal(departed.state,'delivered');assert.equal(fleetPose(config,completed,departed).visible,false);
  assert.equal(engine.getSnapshot().digest,delivered.snapshot.digest,'projecting earlier states does not mutate the completed live result');
});
