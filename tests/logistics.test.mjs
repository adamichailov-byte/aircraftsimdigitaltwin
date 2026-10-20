import test from 'node:test';
import assert from 'node:assert/strict';
import {ReceivingJobs,handlingRoute,handlingTravelMs,handlingPose} from '../src/simulation/logistics.ts';
import {Inventory} from '../src/simulation/inventory.ts';
import {ResourceManager} from '../src/simulation/resources.ts';
import {a100Pilot,a100Resources} from '../src/simulation/fixtures/a100.ts';
import {localInstant} from '../src/simulation/calendar.ts';
import {FleetEngine,fleetFixture,fleetBuildings} from '../src/simulation/flow.ts';
import {fixtures} from '../src/demo/entities.ts';
const at=text=>localInstant(text,'America/New_York');
const start=a100Pilot.start;
function setup(receipts){
  const plan={initial:[],receipts},inv=new Inventory(plan),resources=new ResourceManager(a100Resources,a100Pilot.calendar);
  const jobs=new ReceivingJobs(inv.plan,a100Pilot.calendar,inv,resources);
  const step=(t,locks=[])=>{jobs.settle(t);jobs.dispatch(t,locks);return jobs.snapshot(t);};
  return {jobs,inv,resources,step};
}
const receipt=(id,time=start,extra={})=>({id,at:time,lot:{id,sku:'engine',location:'Central stores',quantity:2,quarantined:0},...extra});
test('arrival, inspection and kitting do not unlock stock; unloading unlocks it exactly once',()=>{
  const {jobs,inv,step}=setup([receipt('engines')]);
  let s=step(start);assert.equal(s.jobs[0].stage,'inspection');assert.equal(inv.available('engine'),0);
  s=step(start+2*3600000);assert.equal(s.jobs[0].stage,'kitting');assert.equal(inv.available('engine'),0);
  s=step(start+3*3600000);assert.equal(s.jobs[0].stage,'loading');
  s=step(start+3*3600000+300000);assert.equal(s.jobs[0].stage,'transit');
  const unloaded=start+3*3600000+600000+handlingTravelMs;
  step(unloaded-300000);assert.equal(inv.available('engine'),0);
  s=step(unloaded);assert.equal(s.jobs[0].stage,'returning');assert.equal(inv.available('engine'),2);
  assert.equal(inv.snapshot().lots[0].location,'Central stores');
  step(unloaded+handlingTravelMs);step(unloaded+handlingTravelMs);
  assert.equal(inv.snapshot().history.filter(e=>e.kind==='material-delivered').length,1);
  assert.equal(inv.snapshot().lots[0].received,2);assert.equal(jobs.snapshot(unloaded+handlingTravelMs).carrierId,null);
});
test('one forklift serializes loads, and aircraft corridor locks prevent dispatch without partial leases',()=>{
  const {inv,resources,step}=setup([receipt('A'),receipt('B')]);step(start);step(start+2*3600000);
  let s=step(start+3*3600000,['west-perimeter']);
  assert.equal(s.carrierId,null);assert.equal(resources.snapshot(start+3*3600000).equipment.find(e=>e.pool==='kit-forklift').used,0);
  assert.match(s.jobs[0].blockers.join(','),/corridor/);
  s=step(start+3*3600000);assert.equal(s.carrierId,'A');assert.equal(s.jobs[1].stage,'loading');
  assert.equal(s.jobs[1].state,'waiting');assert.equal(inv.available('engine'),0);
  for(let i=0;i<20&&s.jobs.some(j=>j.stage!=='complete');i++){
    const next=s.nextEventInstant;assert.ok(next);s=step(next);
    assert.ok(resources.snapshot(next).equipment.find(e=>e.pool==='kit-forklift').used<=1);
    assert.ok(s.jobs.filter(j=>['transit','unloading','returning'].includes(j.stage)).length<=1);
  }
  assert.ok(s.jobs.every(j=>j.stage==='complete'));assert.equal(inv.available('engine'),4);
  assert.equal(inv.snapshot().history.filter(e=>e.kind==='material-delivered').length,2);
  assert.equal(resources.snapshot(s.jobs[0].updatedAt).equipment.find(e=>e.pool==='kit-forklift').used,0);
});
test('held inspection and delayed inspection stay unusable and conserve physical stock',()=>{
  const {inv,step}=setup([receipt('held',start,{held:true}),receipt('delayed',start,{inspectionNotBefore:start+4*3600000})]);
  let s=step(start);assert.match(s.jobs.find(j=>j.id==='delayed').blockers.join(','),/inspection window/);
  s=step(start+2*3600000);assert.equal(s.jobs.find(j=>j.id==='held').stage,'held');assert.equal(inv.available('engine'),0);
  assert.equal(inv.snapshot().lots.reduce((n,l)=>n+l.onHand,0),4);
  for(const l of inv.snapshot().lots)assert.equal(l.opening+l.received,l.onHand+l.consumed+l.scrapped);
  assert.equal(inv.snapshot().lots.find(l=>l.id==='held').inHandling,2);
});
test('day-end pauses forklift and payload together, keeps its exclusive lease and releases crew',()=>{
  const arrival=at('2027-01-04T18:50'),{step,resources}=setup([receipt('overnight',arrival)]);
  let s=step(arrival);while(s.nextEventInstant<at('2027-01-04T22:00'))s=step(s.nextEventInstant);
  s=step(at('2027-01-04T22:00'));const job=s.jobs[0];assert.equal(job.stage,'transit');assert.equal(job.state,'paused');
  const pose=handlingPose(job,at('2027-01-04T22:00'));s=step(at('2027-01-04T23:00'));
  assert.deepEqual(handlingPose(s.jobs[0],at('2027-01-04T23:00')),pose);
  assert.equal(resources.snapshot(at('2027-01-04T23:00')).equipment.find(e=>e.pool==='kit-forklift').used,1);
  assert.equal(resources.snapshot(at('2027-01-04T23:00')).allocations.flatMap(a=>a.crews).length,0);
  s=step(at('2027-01-05T06:00'));assert.equal(s.jobs[0].state,'working');assert.equal(s.jobs[0].remainingWorkMs,job.remainingWorkMs);
  const later=handlingPose(s.jobs[0],at('2027-01-05T06:01'));
  assert.notDeepEqual(later.positionM,pose.positionM);assert.ok(later.carrying);
});
test('canonical route uses vehicle doors, stays clear of inventory and keeps aircraft crossings locked',()=>{
  assert.deepEqual(handlingRoute[0],[-450,-30]);assert.deepEqual(handlingRoute.at(-1),[352,-155]);
  for(const [x,z] of handlingRoute){assert.ok(x<-260||z<-250||x>180);}
  // Both end-wall crossings are centered in the existing 12m/8m doors.
  assert.ok(handlingRoute.some(([x,z])=>x<-465&&z===-30));
  assert.ok(handlingRoute.some(([x,z])=>x>370&&z===-155));
  const walls=[];
  for(const b of fleetBuildings){
    const [cx,cz]=b.centerM,x0=cx-b.lengthM/2,x1=cx+b.lengthM/2,z0=cz-b.widthM/2,z1=cz+b.widthM/2;
    // Vehicle route does not use north/south doors; treat those walls as solid.
    walls.push({id:b.id,x:cx,z:z0,hx:b.lengthM/2,hz:0.9},{id:b.id,x:cx,z:z1,hx:b.lengthM/2,hz:0.9});
    for(const x of [x0,x1])for(const side of [-1,1])walls.push({id:b.id,x,z:cz+side*(b.widthM+b.doorWidthM)/4,hx:0.9,hz:(b.widthM-b.doorWidthM)/4});
  }
  const obstacles=[...walls,...fixtures.filter(f=>['rack','pallet'].includes(f.kind)).map(f=>({id:f.id,x:f.positionM[0],z:f.positionM[2],hx:f.sizeM[0]/2,hz:f.sizeM[2]/2}))];
  const mock={stage:'transit',state:'working',updatedAt:0,durationMs:handlingTravelMs,remainingWorkMs:handlingTravelMs};
  for(let t=0;t<=handlingTravelMs;t+=500){
    const p=handlingPose(mock,t),[x,,z]=p.positionM,c=Math.abs(Math.cos(p.heading)),s=Math.abs(Math.sin(p.heading)),hx=8*c+2.5*s,hz=8*s+2.5*c;
    for(const o of obstacles)assert.ok(Math.abs(x-o.x)>hx+o.hx||Math.abs(z-o.z)>hz+o.hz,`Loaded envelope overlaps ${o.id} at ${x},${z}`);
  }
});
test('delayed receiving fixture starts engine installation at the unload event, never at dock arrival',()=>{
  const config=fleetFixture('receiving-demo'),engine=new FleetEngine(config);
  engine.advanceTo(config.materials.receipts[0].at);let s=engine.getSnapshot();
  assert.equal(s.aircraft[0].pilot.tasks.find(t=>t.taskId==='engines').state,'waiting-material');
  assert.equal(s.inventory.lots.find(l=>l.id==='engine-recovery').available,0);
  const path=[];
  while(!s.logistics.jobs[0]?.dropAt){
    s=engine.advanceTo(s.nextEventInstant);if(s.logistics.carrierId)path.push(handlingPose(s.logistics.jobs[0]));
    for(const tow of s.transfers)assert.ok(!s.logistics.segments.some(segment=>tow.segments.includes(segment)));
  }
  const drop=s.logistics.jobs[0].dropAt,task=s.aircraft[0].pilot.tasks.find(t=>t.taskId==='engines');
  assert.equal(drop,at('2027-01-25T14:00')+600000+handlingTravelMs);assert.equal(task.startedAt,drop);
  assert.equal(task.state,'running');assert.ok(path.some(p=>p.carrying));
  assert.equal(engine.getEvents().filter(e=>e.kind==='material-delivered'&&e.material.receiptId==='engine-recovery').length,1);
});
