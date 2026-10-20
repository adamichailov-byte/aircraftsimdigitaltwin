import test from 'node:test';
import assert from 'node:assert/strict';
import {FleetEngine,fleetFixture} from '../src/simulation/flow.ts';
import {TaskEngine} from '../src/simulation/engine.ts';
import {Inventory} from '../src/simulation/inventory.ts';
import {bay01Pilot} from '../src/simulation/fixtures/a100.ts';

function conservation(s){for(const l of s.inventory.lots){
  assert.equal(l.opening+l.received,l.onHand+l.consumed+l.scrapped);
  assert.ok(l.available>=0&&l.reserved>=0&&l.quarantined>=0);
  assert.equal(l.available,l.onHand-l.reserved-l.quarantined-l.inHandling);
}if(s.logistics.carrierId)for(const tow of s.transfers)assert.ok(!tow.segments.some(segment=>s.logistics.segments.includes(segment)),'aircraft cannot enter a forklift-reserved corridor');}
test('late engine receipt causally unlocks installation, keeps engine milestone truthful and conserves full fleet stock',()=>{
  const config=fleetFixture('late-engines'),engine=new FleetEngine(config,'materials');
  let waiting;
  while(engine.getSnapshot().nextEventInstant!==null){
    const s=engine.advanceTo(engine.getSnapshot().nextEventInstant);conservation(s);
    const first=s.aircraft[0];
    if(first?.pilot.tasks.find(t=>t.taskId==='engines')?.state==='waiting-material'){
      waiting??=s;
      assert.ok(!first.pilot.aircraft.completedMilestones.includes('engines-installed'));
      assert.equal(s.inventory.reservations.filter(r=>r.serialId===first.id&&r.taskId==='engines').length,0);
    }
  }
  assert.ok(waiting);assert.match(waiting.aircraft[0].reasons.join(','),/need 2, available 1/);
  assert.ok(waiting.aircraft[0].pilot.aircraft.completedMilestones.includes('gear-installed'));
  const events=engine.getEvents(),start=events.find(e=>e.kind==='task-started'&&e.serialId==='A100-001'&&e.taskId==='engines');
  const receipt=config.materials.receipts.find(r=>r.id==='engine-recovery');
  const drop=events.find(e=>e.kind==='material-delivered'&&e.material.receiptId===receipt.id);
  assert.ok(drop.instant>receipt.at);assert.equal(start.instant,drop.instant);
  const issue=events.find(e=>e.kind==='material-issued'&&e.serialId==='A100-001'&&e.taskId==='engines');
  assert.ok(start.causeEventIds.includes(issue.id));assert.equal(issue.material.allocations.reduce((n,a)=>n+a.quantity,0),2);
  const reserve=events.find(e=>e.id===issue.causeEventIds[0]);
  assert.ok(reserve.causeEventIds.includes(drop.id));
  const seen=new Set();for(const e of events){for(const id of e.causeEventIds)assert.ok(seen.has(id),`Missing prior cause ${id}`);seen.add(e.id);}
  const end=engine.getSnapshot();assert.ok(end.delivered>0);assert.equal(end.admitted-end.delivered,end.wip);conservation(end);
  assert.equal(end.inventory.lots.filter(l=>l.sku==='engine').reduce((n,l)=>n+l.consumed,0),
    2*events.filter(e=>e.kind==='task-started'&&e.taskId==='engines').length);
  for(const a of end.aircraft){
    const sections=end.inventory.reservations.filter(r=>r.serialId===a.id&&r.taskId==='align');
    assert.equal(sections.length,1);
    assert.equal(sections[0].state,a.pilot.tasks.find(t=>t.taskId==='align').startedAt===null?'reserved':'issued');
  }
});
test('beyond-horizon engine receipt remains an unfinished material wait; no installed engines or negative stock',()=>{
  const base=fleetFixture('late-engines',1),config={...base,materials:{...base.materials,receipts:base.materials.receipts.map(r=>({...r,at:base.recipe.end+86400000}))}};
  const engine=new FleetEngine(config);engine.advanceTo(config.recipe.end);const s=engine.getSnapshot();
  assert.equal(s.status,'horizon-reached');assert.equal(s.delivered,0);assert.equal(s.wip,1);
  assert.equal(s.aircraft[0].pilot.tasks.find(t=>t.taskId==='engines').state,'waiting-material');
  assert.ok(!s.aircraft[0].pilot.aircraft.completedMilestones.includes('engines-installed'));conservation(s);
  assert.equal(s.inventory.lots.filter(l=>l.sku==='engine').reduce((n,l)=>n+l.consumed,0),0);
});
test('major-section shortage holds admission upstream and repeated new runs do not accumulate stock or issues',()=>{
  const base=fleetFixture('baseline',2),config={...base,materials:{initial:base.materials.initial.map(l=>l.sku==='major-section-kit'?{...l,quantity:0}:l),receipts:[]}};
  const engine=new FleetEngine(config);assert.equal(engine.getSnapshot().wip,0);assert.match(engine.getSnapshot().admissionBlockers.join(','),/major-section/);
  engine.advanceTo(base.recipe.end);assert.equal(engine.getSnapshot().delivered,0);
  const a=new FleetEngine(base,'reset-1'),b=new FleetEngine(base,'reset-2');a.advanceTo(base.recipe.end);b.advanceTo(base.recipe.end);
  assert.deepEqual(a.getSnapshot().inventory.lots,b.getSnapshot().inventory.lots);assert.equal(a.getSnapshot().digest,b.getSnapshot().digest);
});
test('90-day daily-job baseline reports 18 deliveries and six WIP, with one kit issue per started task',()=>{
  const config=fleetFixture(),engine=new FleetEngine(config);engine.advanceTo(config.recipe.end);const s=engine.getSnapshot();
  assert.equal(s.status,'horizon-reached');assert.equal(s.admitted,24);assert.equal(s.delivered,18);assert.equal(s.wip,6);conservation(s);
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:config.recipe.calendar.timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  for(const a of s.aircraft)for(const t of a.tasks){
    const actual=a.pilot.tasks.find(task=>task.taskId===t.id);
    if(t.finishWithinDay&&actual.completedAt!==null)assert.equal(day.format(actual.startedAt),day.format(actual.completedAt),`${a.id} ${t.label} crossed a date`);
    if(!Object.keys(t.materialRequirements).length)continue;
    const issues=s.inventory.history.filter(e=>e.kind==='material-issued'&&e.serialId===a.id&&e.taskId===t.id);
    const started=actual.startedAt!==null;
    assert.equal(issues.length,started?1:0);
    if(started)for(const [sku,n] of Object.entries(t.materialRequirements))assert.equal(issues[0].allocations.filter(p=>p.sku===sku).reduce((v,p)=>v+p.quantity,0),n);
  }
  const second=new FleetEngine(config,'other-run');second.advanceTo(config.recipe.end);assert.equal(second.getSnapshot().digest,s.digest);
});
test('receipt at run start waits through handling before admission, then issues no earlier than alignment',()=>{
  const base=fleetFixture('baseline',1),major=base.materials.initial.find(l=>l.sku==='major-section-kit');
  const config={...base,materials:{initial:base.materials.initial.filter(l=>l!==major),receipts:[{id:'initial-receipt',at:base.recipe.start,lot:{...major,id:'at-start'}}]}};
  const engine=new FleetEngine(config);assert.equal(engine.getSnapshot().admitted,0);
  while(!engine.getSnapshot().admitted)engine.advanceTo(engine.getSnapshot().nextEventInstant);
  const s=engine.getSnapshot();assert.equal(s.admitted,1);
  const section=s.inventory.reservations.find(r=>r.taskId==='align');assert.equal(section.state,'reserved');
  assert.equal(s.inventory.lots.find(l=>l.id==='at-start').consumed,0);
  const received=engine.getEvents().find(e=>e.kind==='material-delivered');const reserved=engine.getEvents().find(e=>e.kind==='material-reserved');
  assert.ok(reserved.causeEventIds.includes(received.id));
});
test('event-stepped unfinished material run reaches the same horizon as a whole advance, including a closed final weekend',()=>{
  const config=fleetFixture('late-engines'),stepped=new FleetEngine(config),whole=new FleetEngine(config);
  whole.advanceTo(config.recipe.end);
  while(stepped.getSnapshot().nextEventInstant!==null)stepped.advanceTo(stepped.getSnapshot().nextEventInstant);
  assert.equal(stepped.getSnapshot().instant,config.recipe.end);
  assert.equal(stepped.getSnapshot().status,'horizon-reached');
  assert.equal(stepped.getSnapshot().digest,whole.getSnapshot().digest);
});
test('material-held task does not stop eligible independent work; exact receipt starts it without reissue after breaks',()=>{
  const start=bay01Pilot.start,receipt=start+86400000,inv=new Inventory({initial:[],receipts:[{id:'pair',at:receipt,lot:{id:'pair',sku:'engine',location:'Rack',quantity:2,quarantined:0}}]});
  const tasks=[{...bay01Pilot.tasks[0],id:'engines',durationMs:12*3600000,materialRequirements:{engine:2}},
    {...bay01Pilot.tasks[0],id:'other',materialRequirements:{}}];
  const engine=new TaskEngine({...bay01Pilot,tasks},'independent',()=>true,{
    missing:t=>inv.missing(`A/${t.id}`,t.materialRequirements),issue:(t,at)=>{
      if(!Object.keys(t.materialRequirements).length)return [];
      if(!inv.reserve(`A/${t.id}`,'A',t.id,t.materialRequirements,at))return null;
      return [inv.issue(`A/${t.id}`,at)];}});
  assert.equal(engine.getSnapshot().tasks[0].state,'waiting-material');
  engine.advanceTo(receipt);assert.equal(engine.getSnapshot().tasks[1].state,'complete');
  inv.receiveThrough(receipt);engine.redispatch();assert.equal(engine.getSnapshot().tasks[0].startedAt,receipt);
  engine.advanceTo(receipt+2*86400000);assert.equal(engine.getSnapshot().tasks[0].state,'complete');
  assert.equal(inv.snapshot().history.filter(e=>e.kind==='material-issued').length,1);
});
