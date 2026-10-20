import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskEngine, PilotSession } from '../src/simulation/engine.ts';
import { a100Pilot } from '../src/simulation/fixtures/a100.ts';
import { transfers, transferPose, simulationFixture, pilotWingCraneRows } from '../src/simulation/transfers.ts';
import { fixtures } from '../src/demo/entities.ts';
import { bays, buildings } from '../src/demo/campus.ts';
import { simulationPose } from '../src/scene/simulation-pose.ts';
import { localInstant } from '../src/simulation/calendar.ts';

function walk() {
  const engine = new TaskEngine(a100Pilot, 'journey');
  const snapshots = [engine.getSnapshot()];
  while (engine.getSnapshot().nextEventInstant !== null) snapshots.push(engine.advanceTo(engine.getSnapshot().nextEventInstant));
  return snapshots;
}

test('full recipe reaches delivery in prerequisite order with identical stepped and whole histories', () => {
  const snapshots = walk(), last = snapshots.at(-1);
  assert.equal(last.status, 'complete');
  const whole = new TaskEngine(a100Pilot, 'journey'); whole.advanceTo(last.instant);
  assert.deepEqual(whole.getSnapshot().history, last.history);
  for (const recipe of a100Pilot.tasks) {
    const task = last.tasks.find(t => t.taskId === recipe.id);
    assert.ok(task.completedAt !== null, recipe.id);
    for (const prerequisite of recipe.prerequisites) assert.ok(task.startedAt >= last.tasks.find(t => t.taskId === prerequisite).completedAt);
  }
  assert.equal(simulationPose(a100Pilot, last).state, 'delivered');
  assert.equal(simulationPose(a100Pilot, last).visible, false);
  assert.equal(simulationPose(a100Pilot, last).zoneId, 'delivery');
  assert.ok(last.history.length > 100);
});

test('milestones persist and installed parts appear only after their individual completed tasks', () => {
  let previous = [];
  for (const snapshot of walk()) {
    const pose = simulationPose(a100Pilot, snapshot);
    for (const milestone of previous) assert.ok(snapshot.aircraft.completedMilestones.includes(milestone));
    previous = snapshot.aircraft.completedMilestones;
    for (const [component, taskId] of Object.entries({wings:'wings-closeout',tail:'tail-closeout',gear:'gear-closeout',engines:'engines-closeout'})) {
      assert.equal(pose.components[component], snapshot.tasks.find(t=>t.taskId===taskId).state === 'complete');
    }
    assert.equal(pose.painted, snapshot.tasks.find(t=>t.taskId==='cure').state === 'complete');
    if (pose.zoneId === 'bay-6') assert.equal(pose.painted, false);
  }
});

test('elapsed cure and offsite flight cross calendar boundaries; flight retains return slot', () => {
  const snapshots = walk(), final = snapshots.at(-1);
  for (const [id, hours] of [['cure',8],['flight',4]]) {
    const task = final.tasks.find(t=>t.taskId===id);
    assert.equal(task.completedAt-task.startedAt, hours*3600000);
    assert.equal(final.history.some(e=>e.payload.taskId===id && e.kind==='task-paused'), false);
  }
  const offsite = snapshots.find(s=>s.tasks.find(t=>t.taskId==='flight').state==='running');
  const hidden = simulationPose(a100Pilot, offsite);
  assert.equal(hidden.visible, false); assert.equal(hidden.zoneId,'flight-test');
  assert.equal(hidden.returnSlot,'flightline');
  const returned = snapshots.find(s=>s.tasks.find(t=>t.taskId==='post-flight').state==='running');
  assert.equal(simulationPose(a100Pilot,returned).visible,true);
  assert.equal(simulationPose(a100Pilot,returned).zoneId,'flightline');
});

test('transfers use distance/speed plus connect, turn and disconnect time; poses are continuous', () => {
  for (const route of Object.values(transfers)) {
    assert.equal(route.durationMs,route.phases.reduce((sum,p)=>sum+p.durationMs,0));
    assert.ok(route.durationMs >= 600000);
    let time=0, previous=transferPose(route,0);
    for (const phase of route.phases) {
      if (phase.kind==='move') assert.equal(phase.durationMs,Math.ceil(Math.hypot(phase.to[0]-phase.from[0],phase.to[1]-phase.from[1])/phase.speedMps*1000));
      for(let i=1;i<=20;i++) {
        const pose=transferPose(route,time+phase.durationMs*i/20);
        assert.ok(Math.hypot(pose.positionM[0]-previous.positionM[0],pose.positionM[2]-previous.positionM[2]) <= 40);
        previous=pose;
      }
      time+=phase.durationMs;
    }
    assert.deepEqual(transferPose(route,route.durationMs).positionM,[...route.endPosition.slice(0,1),0.7,route.endPosition[1]]);
  }
  for (const id of ['bay-1-to-2','bay-2-to-3','bay-4-to-5','bay-5-to-6']) {
    assert.ok(transfers[id].phases.filter(p=>p.kind==='move').every(p=>p.to[0]>p.from[0] && p.from[1]===p.to[1]));
  }
});

test('Bay03 perimeter and exterior transfers clear building walls with conservative full aircraft envelope', () => {
  // Local rectangle bounds all fuselage, wing and tail vertices (60m × 54.4m).
  // Check every 0.5m of travel and every degree of rotation, not just route centres.
  const obstacles=buildings.filter(b=>b.id!=='assembly').map(b=>({x0:b.centerM[0]-b.lengthM/2,x1:b.centerM[0]+b.lengthM/2,z0:b.centerM[1]-b.widthM/2,z1:b.centerM[1]+b.widthM/2}));
  assert.ok(buildings.find(b=>b.id==='assembly').doorHeightM>17.7);
  for (const id of ['bay-3-to-4','bay-6-to-paint','paint-to-flightline']) {
    const route=transfers[id];
    for(let t=0;t<=route.durationMs;t+=250) {
      const p=transferPose(route,t), [x,,z]=p.positionM, c=Math.cos(p.heading),s=Math.sin(p.heading);
      // Rectangle projection is deliberately larger than the swept wing planform.
      const hx=Math.abs(c)*30+Math.abs(s)*27.2,hz=Math.abs(s)*30+Math.abs(c)*27.2;
      for(const o of obstacles) assert.ok(x+hx<=o.x0||x-hx>=o.x1||z+hz<=o.z0||z-hz>=o.z1,`${id}: support building`);
      if(id==='bay-3-to-4') assert.ok(x-hx>-260&&x+hx<180&&z-hz>-250&&z+hz<190,`${id}: hall wall`);
      else {
        // At east facade, both projection extremes must fit one of its 90m openings.
        if(x-hx<180&&x+hx>180) assert.ok((z-hz>=-75&&z+hz<=15)||(z-hz>=40&&z+hz<=130),`${id}: door at ${x},${z}`);
        // SAT: a horizontal wall segment against the full oriented rectangle.
        for(const wallZ of [-70,10]) {
          const midX=104, half=44, dx=midX-x,dz=wallZ-z;
          const intersects=Math.abs(dx)<=half+hx && Math.abs(dz)<=hz
            && Math.abs(c*dx-s*dz)<=30+half*Math.abs(c)
            && Math.abs(s*dx+c*dz)<=27.2+half*Math.abs(s);
          assert.equal(intersects,false,`${id}: paint wall at ${x},${z}`);
        }
      }
    }
  }
  const into=transfers['bay-6-to-paint'],out=transfers['paint-to-flightline'];
  assert.equal(transferPose(into,into.durationMs).heading,Math.PI);
  const reverse=out.phases.find(p=>p.kind==='move');
  assert.equal(reverse.reverse,true); assert.equal(reverse.heading,Math.PI);
});

test('parked pilot fixtures leave every transfer swept rectangle clear without removing assets',()=>{
  const craneColumns=[-44,44].flatMap(dx=>pilotWingCraneRows.map(dz=>({id:`crane-${dx}-${dz}`,kind:'rack',
    positionM:[bays[1].centerM[0]+dx,0,bays[1].centerM[1]+dz],sizeM:[3.8,24,3.8]})));
  for(const route of Object.values(transfers)) for(let t=0;t<=route.durationMs;t+=500) {
    const p=transferPose(route,t),[x,,z]=p.positionM,c=Math.cos(p.heading),s=Math.sin(p.heading);
    const hx=Math.abs(c)*30+Math.abs(s)*27.2,hz=Math.abs(s)*30+Math.abs(c)*27.2;
    for(const original of [...fixtures,...craneColumns]) {
      const f=simulationFixture(original),dx=f.positionM[0]-x,dz=f.positionM[2]-z;
      // Access stairs extend beyond a platform's main deck dimensions.
      const a=f.sizeM[0]/2+(f.kind==='platform'?6:0),b=f.sizeM[2]/2+(f.kind==='platform'?3.4:0);
      const intersects=Math.abs(dx)<=a+hx&&Math.abs(dz)<=b+hz
        &&Math.abs(c*dx-s*dz)<=30+a*Math.abs(c)+b*Math.abs(s)
        &&Math.abs(s*dx+c*dz)<=27.2+a*Math.abs(s)+b*Math.abs(c);
      assert.equal(intersects,false,`${route.id}: ${f.id}`);
      assert.equal(f.id,original.id);
    }
  }
});

test('render interpolation stops at the next operational event and never creates milestones',()=>{
  const engine=new TaskEngine(a100Pilot);
  while(!engine.getSnapshot().tasks.some(t=>t.taskId==='bay-1-to-2'&&t.state==='running')) engine.advanceTo(engine.getSnapshot().nextEventInstant);
  const snapshot=engine.getSnapshot(),route=transfers['bay-1-to-2'];
  const before=JSON.stringify(snapshot);
  const middle=simulationPose(a100Pilot,snapshot,snapshot.instant+route.durationMs/2);
  assert.ok(middle.positionM[0]>-184&&middle.positionM[0]<-40);
  const future=simulationPose(a100Pilot,snapshot,a100Pilot.end);
  assert.equal(future.zoneId,'bay-1');
  assert.equal(future.components.wings,false);
  assert.equal(JSON.stringify(snapshot),before);
});

test('tow manoeuvre stepping uses the same clock and preserves event history',()=>{
  const session=new PilotSession(a100Pilot,()=>0);
  while(!session.getSnapshot().tasks.some(t=>t.taskId==='bay-1-to-2'&&t.state==='running')) session.nextOperation();
  const start=session.getSnapshot().instant;
  session.nextTowPhase();assert.equal(session.getSnapshot().instant,start+300000);
  session.nextTowPhase();assert.equal(simulationPose(a100Pilot,session.getSnapshot()).positionM[0],-40);
  session.nextTowPhase();assert.equal(simulationPose(a100Pilot,session.getSnapshot()).stationId,'bay-2');
  const whole=new TaskEngine(a100Pilot);whole.advanceTo(session.getSnapshot().instant);
  assert.deepEqual(session.getSnapshot().history,whole.getSnapshot().history);
});

test('elapsed cure keeps running overnight while productive work waits across the weekend',()=>{
  const at=text=>localInstant(text,a100Pilot.calendar.timeZone);
  const task={label:'Analytic task',prerequisites:[],crewRequirements:{},materialRequirements:{},completionMilestones:[]};
  const engine=new TaskEngine({...a100Pilot,start:at('2027-01-08T21:00'),tasks:[
    {...task,id:'cure-example',durationMs:8*3600000,durationMode:'elapsed',startPolicy:'anytime'},
    {...task,id:'work-example',durationMs:2*3600000},
  ]});
  engine.advanceTo(at('2027-01-11T07:00'));
  assert.equal(engine.getSnapshot().tasks[0].completedAt,at('2027-01-09T05:00'));
  assert.equal(engine.getSnapshot().tasks[1].completedAt,at('2027-01-11T07:00'));
});
