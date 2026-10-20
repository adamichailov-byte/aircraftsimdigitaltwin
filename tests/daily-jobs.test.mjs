import test from 'node:test';
import assert from 'node:assert/strict';
import {TaskEngine} from '../src/simulation/engine.ts';
import {a100Pilot,materialCatalog} from '../src/simulation/fixtures/a100.ts';
import {FleetEngine,fleetFixture} from '../src/simulation/flow.ts';
import {localInstant,workingTimeBetween} from '../src/simulation/calendar.ts';

const H=3600000,calendar=a100Pilot.calendar,at=local=>localInstant(local,calendar.timeZone);
const daily={id:'daily',label:'Secure engine attachments',prerequisites:[],durationMs:4*H,finishWithinDay:true,
  crewRequirements:{},materialRequirements:{},completionMilestones:[]};
const definition=(start,tasks=[daily])=>({...a100Pilot,start,end:at('2027-01-12T22:00'),tasks});
const date=new Intl.DateTimeFormat('en-CA',{timeZone:calendar.timeZone,year:'numeric',month:'2-digit',day:'2-digit'});

test('daily jobs defer a late start until a full same-day window without issuing material early',()=>{
  let issues=0;
  const engine=new TaskEngine(definition(at('2027-01-08T21:00')),'daily-window',()=>true,
    {issue:()=>{issues++;return[];},missing:()=>[]});
  const waiting=engine.getSnapshot().tasks[0];
  assert.equal(waiting.state,'waiting-day-window');assert.equal(waiting.startedAt,null);assert.equal(issues,0);
  assert.match(waiting.calendarBlockers.join(' '),/working time.*today/i);
  engine.advanceTo(at('2027-01-11T06:00'));
  assert.equal(engine.getSnapshot().tasks[0].startedAt,at('2027-01-11T06:00'));
  assert.equal(issues,1);
  engine.advanceTo(at('2027-01-11T10:00'));
  assert.equal(engine.getSnapshot().tasks[0].state,'complete');
  assert.equal(engine.getSnapshot().history.filter(e=>e.kind==='task-deferred').length,1);
});

test('daily jobs include breaks in their start window and may finish exactly at day end',()=>{
  const throughBreak=new TaskEngine(definition(at('2027-01-04T09:00')));
  throughBreak.advanceTo(at('2027-01-04T13:30'));
  assert.equal(throughBreak.getSnapshot().tasks[0].completedAt,at('2027-01-04T13:30'));
  const endOfDay=new TaskEngine(definition(at('2027-01-04T17:30')));
  endOfDay.advanceTo(at('2027-01-04T22:00'));
  assert.equal(endOfDay.getSnapshot().tasks[0].completedAt,at('2027-01-04T22:00'));
});

test('detailed A100 jobs preserve total effort and issue each kit once at its first operation',()=>{
  const work=a100Pilot.tasks.filter(t=>t.durationMode!=='elapsed'&&t.kind!=='transfer');
  assert.ok(work.length>50,'the production recipe has real work-package detail');
  assert.ok(work.every(t=>t.finishWithinDay&&t.durationMs<=4*H),'all staffed packages fit a short daily window');
  assert.equal(a100Pilot.tasks.filter(t=>t.kind!=='transfer').reduce((sum,t)=>sum+t.durationMs,0),226*H);
  const materials={};
  for(const task of a100Pilot.tasks)for(const [sku,count] of Object.entries(task.materialRequirements))materials[sku]=(materials[sku]??0)+count;
  assert.deepEqual(materials,Object.fromEntries(Object.keys(materialCatalog).map(sku=>[sku,sku==='engine'?2:1])));
});

test('fleet daily waits remain schedulable and normal daily jobs finish on their start date',()=>{
  const base=fleetFixture('baseline',2),start=at('2027-01-04T20:00');
  const config={...base,recipe:{...base.recipe,start},orders:base.orders.map((o,i)=>({...o,releaseAt:Math.max(start,o.releaseAt)}))};
  const engine=new FleetEngine(config,'late-daily-fleet');
  engine.advanceTo(at('2027-01-04T21:00'));
  assert.equal(engine.getSnapshot().status,'active','a scheduled wait is not a flow deadlock');
  assert.ok(engine.getSnapshot().aircraft[0].pilot.tasks.some(t=>t.state==='waiting-day-window'));
  engine.advanceTo(config.recipe.end);
  assert.equal(engine.getSnapshot().status,'complete');
  for(const aircraft of engine.getSnapshot().aircraft)for(const task of aircraft.pilot.tasks){
    const recipe=aircraft.tasks.find(t=>t.id===task.taskId);
    if(!recipe.finishWithinDay)continue;
    assert.equal(date.format(task.startedAt),date.format(task.completedAt),`${aircraft.id} ${task.label}`);
    assert.equal(workingTimeBetween(calendar,task.startedAt,task.completedAt),recipe.durationMs);
  }
});
