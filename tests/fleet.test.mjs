import test from 'node:test';
import assert from 'node:assert/strict';
import {FleetEngine, fleetFixture} from '../src/simulation/flow.ts';

test('finite fleet reserves atomically, holds source until tail-clear and conserves WIP',()=>{
  const config=fleetFixture('slow-bay-3'), engine=new FleetEngine(config,'test');
  let backedUp=false,upstream=false,steps=0;
  while(engine.getSnapshot().nextEventInstant!==null){
    const s=engine.advanceTo(engine.getSnapshot().nextEventInstant);steps++;
    assert.ok(s.wip<=config.wipLimit);assert.ok(s.aircraft.filter(a=>a.state==='queued').length<=3);
    assert.equal(s.admitted-s.delivered,s.wip);
    const tugs=s.transfers.map(t=>t.tugId);assert.equal(new Set(tugs).size,tugs.length);
    const segments=s.transfers.flatMap(t=>t.segments);assert.equal(new Set(segments).size,segments.length);
    for(const t of s.transfers){
      if(t.toSlot!=='departed')assert.equal(s.slots.find(slot=>slot.id===t.toSlot).reservedBy,t.serialId);
      const source=s.slots.find(slot=>slot.id===t.fromSlot);
      if(s.instant<t.clearAt)assert.equal(source.occupiedBy,t.serialId);
      else assert.notEqual(source.occupiedBy,t.serialId);
    }
    backedUp ||= s.aircraft.some(a=>a.slot==='bay-2'&&a.reasons.some(r=>r.includes('downstream')));
    upstream ||= s.upstream>0;
    assert.ok(steps<10000);
  }
  assert.ok(backedUp);assert.ok(upstream);
  const events=engine.getEvents();
  const seen=new Set();for(const event of events){for(const cause of event.causeEventIds)assert.ok(seen.has(cause),`Missing prior cause ${cause}`);seen.add(event.id);}
  const ids=events.filter(e=>e.kind==='admitted').map(e=>e.serialId);
  assert.equal(new Set(ids).size,ids.length);
  for(const e of events.filter(e=>e.kind==='transfer-started')){
    const clear=events.find(c=>c.kind==='source-cleared'&&c.transferId===e.transferId);
    const arrival=events.find(c=>c.kind==='transfer-arrived'&&c.transferId===e.transferId);
    if(arrival)assert.ok(clear.instant>e.instant&&clear.instant<=arrival.instant);
  }
});

test('headless whole and arbitrary playback targets produce identical event histories',()=>{
  const config=fleetFixture('baseline'),one=new FleetEngine(config,'same'),stepped=new FleetEngine(config,'same');
  one.advanceTo(config.recipe.end);
  for(let t=config.recipe.start;t<config.recipe.end;t+=19*3600000)stepped.advanceTo(t);
  stepped.advanceTo(config.recipe.end);
  assert.deepEqual(stepped.getEvents(),one.getEvents());
  assert.equal(stepped.getSnapshot().digest,one.getSnapshot().digest);
  assert.ok(one.getSnapshot().delivered>0);
});

test('no orders completes; zero capacity blocks explicitly; invalid inputs and event guards fail clearly',()=>{
  const base=fleetFixture('baseline');
  assert.equal(new FleetEngine({...base,orders:[]}).getSnapshot().status,'complete');
  const zero=new FleetEngine({...base,wipLimit:0});zero.advanceTo(base.recipe.end);
  assert.equal(zero.getSnapshot().status,'blocked');assert.match(zero.getSnapshot().diagnosis,/WIP/);
  const tugs=new FleetEngine({...base,tugCount:0});tugs.advanceTo(base.recipe.end);
  assert.equal(tugs.getSnapshot().status,'blocked');assert.match(tugs.getSnapshot().diagnosis,/tug/);
  assert.throws(()=>new FleetEngine({...base,orders:[base.orders[0],base.orders[0]]}),/serial/i);
  const limited=new FleetEngine({...base,eventLimit:3});limited.advanceTo(base.recipe.end);
  assert.equal(limited.getSnapshot().status,'event-limit');
  assert.ok(limited.getSnapshot().eventCount<=3);
  assert.throws(()=>new FleetEngine({...base,recipe:{...base.recipe,tasks:base.recipe.tasks.map((t,i)=>i===0?{...t,stationId:'unknown'}:t)}}),/station/);
  const badRouting=new FleetEngine({...base,recipe:{...base.recipe,tasks:base.recipe.tasks.map((t,i)=>i===0?{...t,stationId:'bay-2'}:t)}});
  badRouting.advanceTo(base.recipe.end);
  assert.equal(badRouting.getSnapshot().status,'blocked');assert.match(badRouting.getSnapshot().diagnosis,/routing/);
});

test('simultaneous orders use deterministic FCFS ties; refused transfers hold no partial resources',()=>{
  const base=fleetFixture('baseline',3),orders=base.orders.map((o,i)=>({...o,serialId:['C','B','A'][i],releaseAt:base.recipe.start}));
  const engine=new FleetEngine({...base,orders});const s=engine.getSnapshot();
  assert.equal(s.transfers.length,1);assert.equal(s.transfers[0].serialId,'A');
  assert.deepEqual(s.slots.filter(slot=>slot.reservedBy).map(slot=>slot.reservedBy),['A']);
  assert.equal(s.wip,3);assert.equal(s.delivered,0);
});

test('offsite flight retains its occupied return stand and both marked delivery slots are used',()=>{
  const config=fleetFixture('baseline',4),engine=new FleetEngine(config);
  let offsite=false;const deliveredSlots=new Set();
  while(engine.getSnapshot().nextEventInstant!==null){
    const s=engine.advanceTo(engine.getSnapshot().nextEventInstant);
    for(const a of s.aircraft)if(a.state==='offsite'){offsite=true;assert.equal(s.slots.find(slot=>slot.id==='flightline').occupiedBy,a.id);}
    for(const slot of s.slots.filter(slot=>slot.id.startsWith('delivery')&&slot.occupiedBy))deliveredSlots.add(slot.id);
  }
  assert.ok(offsite);assert.deepEqual([...deliveredSlots].sort(),['delivery','delivery-2']);
});
