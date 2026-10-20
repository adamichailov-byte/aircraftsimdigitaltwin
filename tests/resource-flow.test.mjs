import test from 'node:test';
import assert from 'node:assert/strict';
import {FleetEngine,fleetFixture} from '../src/simulation/flow.ts';
import {localInstant,workingTimeBetween} from '../src/simulation/calendar.ts';

test('daily jobs hand over fixed crews within the day and wait overnight without reissuing kits',()=>{
  const config=fleetFixture('baseline',1),engine=new FleetEngine(config,'resource-shifts');
  const shiftEnd=localInstant('2027-01-04T14:00',config.recipe.calendar.timeZone);
  engine.advanceTo(shiftEnd);
  let aircraft=engine.getSnapshot().aircraft[0],align=aircraft.pilot.tasks.find(task=>task.taskId==='align-survey');
  assert.equal(align.state,'running');
  assert.equal(engine.getSnapshot().resources.allocations.find(item=>item.serialId==='A100-001'&&item.taskId==='align-survey').shift,'Shift 2');
  assert.ok(engine.getEvents().some(event=>event.kind==='resource-released'&&event.serialId==='A100-001'&&event.taskId==='align-survey'));
  assert.equal(engine.getSnapshot().inventory.lots.find(lot=>lot.sku==='major-section-kit').consumed,1);
  engine.advanceTo(localInstant('2027-01-04T15:00',config.recipe.calendar.timeZone));
  aircraft=engine.getSnapshot().aircraft[0];align=aircraft.pilot.tasks.find(task=>task.taskId==='align-survey');
  assert.ok(align.startedAt!==null);
  assert.equal(engine.getEvents().filter(event=>event.kind==='task-started'&&event.taskId==='align-survey').length,1);
  assert.ok(engine.getEvents().some(event=>event.kind==='task-paused'&&event.taskId==='align-survey'));
  assert.ok(engine.getEvents().some(event=>event.kind==='task-resumed'&&event.taskId==='align-survey'));
  assert.equal(engine.getSnapshot().inventory.lots.find(lot=>lot.sku==='major-section-kit').consumed,1);
  engine.advanceTo(localInstant('2027-01-04T22:00',config.recipe.calendar.timeZone));
  assert.ok(engine.getSnapshot().aircraft[0].pilot.tasks.some(task=>task.state==='waiting-day-window'));
  assert.ok(!engine.getSnapshot().aircraft[0].pilot.tasks.some(task=>task.state==='running'));
  assert.equal(engine.getSnapshot().resources.crews.find(pool=>pool.pool==='structural').used,0);
  for(const event of engine.getEvents().filter(event=>event.kind==='resource-allocated'||event.kind==='resource-released')){
    if(event.kind==='resource-allocated')assert.ok(event.resource.crews.length+event.resource.equipment.length>0);
  }
  const alignDef=aircraft.tasks.find(task=>task.id==='align-survey');
  assert.equal(workingTimeBetween(config.recipe.calendar,align.startedAt,align.completedAt??engine.getSnapshot().instant),
    Math.max(0,alignDef.durationMs-align.remainingWorkMs));
  const activeUnits=new Set();
  for(const event of engine.getEvents().filter(event=>event.kind==='resource-allocated'||event.kind==='resource-released')){
    for(const kind of ['crews','equipment'])for(const unit of event.resource[kind]){
      const key=`${kind}/${event.resource.shift}/${unit.pool}/${unit.unit}`;
      if(event.kind==='resource-allocated'){assert.equal(activeUnits.has(key),false,`duplicate lease ${key}`);activeUnits.add(key);}
      else {assert.equal(activeUnits.has(key),true,`released unit was not assigned ${key}`);activeUnits.delete(key);}
    }
  }
  assert.equal(activeUnits.size,engine.getSnapshot().resources.allocations.reduce((sum,item)=>sum+item.crews.length+item.equipment.length,0));
});

test('zero staffed capacity blocks the fleet with a concrete resource reason',()=>{
  const base=fleetFixture('baseline',1),resources={...base.resources,crewsByShift:Object.fromEntries(
    Object.entries(base.resources.crewsByShift).map(([shift,pools])=>[shift,{...pools,structural:0}]))};
  const engine=new FleetEngine({...base,resources},'zero-structures');engine.advanceTo(base.recipe.end);
  assert.equal(engine.getSnapshot().status,'blocked');
  assert.match(engine.getSnapshot().diagnosis,/structural crew · need 6, available 0/);
});

test('fleet resource history never double-leases people or shared equipment and returns all units',()=>{
  const config=fleetFixture('baseline',8),engine=new FleetEngine(config,'resource-conservation');engine.advanceTo(config.recipe.end);
  assert.equal(engine.getSnapshot().status,'complete');
  const leased=new Set();
  for(const event of engine.getEvents())if(event.kind==='resource-allocated'||event.kind==='resource-released'){
    for(const unit of event.resource.crews){
      const key=`crew/${event.resource.shift}/${unit.pool}/${unit.unit}`;
      if(event.kind==='resource-allocated'){assert.equal(leased.has(key),false,`crew double-booked: ${key}`);leased.add(key);}
      else {assert.equal(leased.has(key),true,`unknown crew release: ${key}`);leased.delete(key);}
    }
    for(const unit of event.resource.equipment){
      const key=`equipment/${unit.pool}/${unit.unit}`;
      if(event.kind==='resource-allocated'){assert.equal(leased.has(key),false,`equipment double-booked: ${key}`);leased.add(key);}
      else {assert.equal(leased.has(key),true,`unknown equipment release: ${key}`);leased.delete(key);}
    }
    const crews=new Map(),equipment=new Map();
    for(const item of leased){const parts=item.split('/');if(parts[0]==='crew'){
      const key=`${parts[1]}/${parts[2]}`;crews.set(key,(crews.get(key)??0)+1);
    }else {const pool=parts[1];equipment.set(pool,(equipment.get(pool)??0)+1);}}
    for(const [key,count] of crews){const [shift,pool]=key.split('/');assert.ok(count<=(config.resources.crewsByShift[shift]?.[pool]??0),`${key} uses ${count}`);}
    for(const [pool,count] of equipment)assert.ok(count<=(config.resources.equipment[pool]??0),`${pool} uses ${count}`);
  }
  assert.equal(leased.size,0);
});

test('two ready inspections share the limited quality pool; extra crews do not shorten fixed task time',()=>{
  const config=fleetFixture('limited-inspectors',24),engine=new FleetEngine(config,'quality-capacity');let snapshot=engine.getSnapshot(),waiting=null,active=null;
  for(let i=0;i<20000&&snapshot.nextEventInstant!==null;i++){
    snapshot=engine.advanceTo(snapshot.nextEventInstant,1);
    waiting=snapshot.aircraft.flatMap(aircraft=>aircraft.pilot.tasks.filter(task=>task.state==='waiting-resource'
      &&task.resourceBlockers?.some(reason=>reason.includes('quality crew'))
      &&aircraft.tasks.find(definition=>definition.id===task.taskId)?.label.toLowerCase().includes('inspect'))
      .map(task=>({aircraft,task}))).at(0)??null;
    active=snapshot.resources.allocations.filter(allocation=>allocation.crews.filter(unit=>unit.pool==='quality').length===2
      &&snapshot.aircraft.find(a=>a.id===allocation.serialId)?.tasks.find(task=>task.id===allocation.taskId)?.label.toLowerCase().includes('inspect'))[0]??null;
    if(waiting&&active)break;
  }
  assert.ok(waiting,'a second ready inspection should show its quality crew blocker');
  assert.ok(active,'the first inspection should own both quality crew units');
  assert.match(waiting.task.resourceBlockers.join(' '),/quality crew · need 2, available 0/);
  assert.equal(snapshot.resources.crews.find(pool=>pool.pool==='quality').capacity,2);

  const one=fleetFixture('baseline',1),limited={...one,resources:{...one.resources,crewsByShift:Object.fromEntries(
    Object.entries(one.resources.crewsByShift).map(([shift,pools])=>[shift,{...pools,systems:6}]))}};
  const normalRun=new FleetEngine(one,'normal-crew'),limitedRun=new FleetEngine(limited,'limited-crew');
  normalRun.advanceTo(one.recipe.end);limitedRun.advanceTo(limited.recipe.end);
  for(const run of [normalRun,limitedRun]){
    const start=run.getEvents().find(event=>event.kind==='task-started'&&event.taskId==='wiring');
    const endEvent=run.getEvents().find(event=>event.kind==='task-completed'&&event.taskId==='wiring');
    assert.ok(start&&endEvent);
    assert.equal(workingTimeBetween(one.recipe.calendar,start.instant,endEvent.instant),3*3600000);
  }
});

test('parallel Bay03 work competes for systems crews without scaling task duration',()=>{
  const runWithSystems=capacity=>{
    const base=fleetFixture('baseline',1),resources={...base.resources,crewsByShift:Object.fromEntries(
      Object.entries(base.resources.crewsByShift).map(([shift,pools])=>[shift,{...pools,systems:capacity}]))};
    const engine=new FleetEngine({...base,resources},`bay03-systems-${capacity}`);let snapshot=engine.getSnapshot();
    for(let i=0;i<20000;i++){
      const tasks=snapshot.aircraft[0]?.pilot.tasks??[];
      const wiring=tasks.find(task=>task.taskId==='wiring'),hydraulics=tasks.find(task=>task.taskId==='hydraulics');
      if(wiring&&hydraulics&&['running','waiting-resource'].includes(wiring.state)
        &&['running','waiting-resource'].includes(hydraulics.state))return {engine,snapshot,wiring,hydraulics};
      if(snapshot.nextEventInstant===null)break;
      snapshot=engine.advanceTo(snapshot.nextEventInstant,1);
    }
    assert.fail('Bay03 wiring and hydraulics never became concurrently ready');
  };
  const enough=runWithSystems(10);
  assert.equal(enough.wiring.state,'running');assert.equal(enough.hydraulics.state,'running');
  assert.equal(enough.snapshot.resources.crews.find(pool=>pool.pool==='systems').used,10);
  const constrained=runWithSystems(6);
  const running=[constrained.wiring,constrained.hydraulics].find(task=>task.state==='running');
  const waiting=[constrained.wiring,constrained.hydraulics].find(task=>task.state==='waiting-resource');
  assert.ok(running);assert.ok(waiting);
  assert.match(waiting.resourceBlockers.join(' '),/systems crew · need (4|6), available \d+/);
  const runningCrewCount=running.taskId==='wiring'?6:4;
  assert.equal(constrained.snapshot.resources.crews.find(pool=>pool.pool==='systems').used,runningCrewCount);
  constrained.engine.advanceTo(constrained.engine.config.recipe.end);
  const duration=3;
  const work=constrained.engine.getEvents().find(event=>event.kind==='task-started'&&event.taskId===running.taskId);
  const completed=constrained.engine.getEvents().find(event=>event.kind==='task-completed'&&event.taskId===running.taskId);
  assert.ok(work&&completed);assert.equal(workingTimeBetween(constrained.engine.config.recipe.calendar,work.instant,completed.instant),duration*3600000);
});
