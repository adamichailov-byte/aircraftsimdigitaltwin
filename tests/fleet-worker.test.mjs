import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {FleetEngine,fleetFixture} from '../src/simulation/flow.ts';
import {FleetClient} from '../src/simulation/client.ts';

function reply(worker,requestId){return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error(`Worker timeout on request ${requestId}`)),15000);
  // A longer recipe may take longer overall while still yielding responsive progress.
  // Keep the 15-second inactivity guard; cancellation has its separate 250ms assertion.
  const handler=message=>{if(message.requestId!==requestId)return;timeout.refresh();
    if(message.done){clearTimeout(timeout);worker.off('message',handler);resolve(message);}};
  worker.on('message',handler);worker.once('error',reject);
});}
test('real worker matches headless output and acknowledges cancellation between batches',async()=>{
  const config=fleetFixture(),worker=new Worker(new URL('./helpers/fleet-worker.mjs',import.meta.url));
  try{
    let result=reply(worker,1);worker.postMessage({type:'start',config,runId:'real',requestId:1});const started=await result;
    assert.equal(started.snapshot.instant,config.recipe.start);assert.equal(started.snapshot.delivered,0);
    result=reply(worker,2);worker.postMessage({type:'run',runId:'real',requestId:2});const completed=await result;
    const pure=new FleetEngine(config,'real');pure.advanceTo(config.recipe.end);
    assert.equal(completed.snapshot.digest,pure.getSnapshot().digest);
    assert.equal(completed.snapshot.delivered,pure.getSnapshot().delivered);
    assert.equal(completed.snapshot.instant,pure.getSnapshot().instant);
    assert.deepEqual(completed.snapshot.slots,pure.getSnapshot().slots);
    assert.ok(completed.events.length>0);assert.equal(completed.events.at(-1).sequence,completed.snapshot.eventCount);
    assert.ok(Object.keys(completed.actual).length>completed.snapshot.history.length);
    result=reply(worker,10);worker.postMessage({type:'plan',config:fleetFixture('receiving-demo'),runId:'real',requestId:10});const planned=await result;
    assert.ok(planned.plan.activities.length>30);assert.equal(planned.snapshot,undefined);assert.equal(planned.actual,undefined);
    const lateConfig=fleetFixture('late-engines');
    result=reply(worker,20);worker.postMessage({type:'start',config:lateConfig,runId:'late',requestId:20});await result;
    result=reply(worker,21);worker.postMessage({type:'run',runId:'late',requestId:21});const late=await result;
    const latePure=new FleetEngine(lateConfig,'late');latePure.advanceTo(lateConfig.recipe.end);
    assert.equal(late.snapshot.status,'horizon-reached');assert.equal(late.snapshot.instant,lateConfig.recipe.end);
    assert.equal(late.snapshot.digest,latePure.getSnapshot().digest);
    assert.deepEqual(late.snapshot.inventory.lots,latePure.getSnapshot().inventory.lots);
    result=reply(worker,3);worker.postMessage({type:'start',config:fleetFixture('baseline',60,366),runId:'cancel',requestId:3});await result;
    worker.postMessage({type:'run',runId:'cancel',requestId:4});
    // Wait for actual progress, so cancellation cannot pass by merely canceling an idle worker.
    await new Promise(resolve=>{const handler=m=>{if(m.requestId===4&&!m.done){worker.off('message',handler);resolve();}};worker.on('message',handler);});
    result=reply(worker,5);const began=performance.now();worker.postMessage({type:'cancel',runId:'cancel',requestId:5});const canceled=await result;
    assert.equal(canceled.state,'cancelled');assert.ok(performance.now()-began<250);
    assert.ok(canceled.snapshot.delivered<60);
  }finally{await worker.terminate();}
});

test('worker outage and rework demonstrations stop at their inspectable states',async()=>{
  const worker=new Worker(new URL('./helpers/fleet-worker.mjs',import.meta.url));
  try{
    let result=reply(worker,30);worker.postMessage({type:'start',config:fleetFixture('wing-crane-outage'),runId:'outage',requestId:30});await result;
    result=reply(worker,31);worker.postMessage({type:'outage-example',runId:'outage',requestId:31});
    const outage=await result;
    assert.equal(outage.snapshot.aircraft[0].slot,'bay-2');
    assert.equal(outage.snapshot.aircraft[0].pilot.tasks.find(task=>task.taskId==='wings').state,'paused-equipment');
    result=reply(worker,32);worker.postMessage({type:'start',config:fleetFixture('inspection-rework'),runId:'rework',requestId:32});await result;
    result=reply(worker,33);worker.postMessage({type:'rework-example',runId:'rework',requestId:33});
    const rework=await result;
    assert.equal(rework.snapshot.aircraft[0].slot,'bay-2');
    assert.ok(rework.snapshot.aircraft[0].pilot.tasks.some(task=>task.qualityStatus==='failed'));
    assert.ok(rework.snapshot.aircraft[0].pilot.tasks.some(task=>task.qualityStatus==='repair'&&task.state==='running'));
  }finally{await worker.terminate();}
});

test('client drops old-run and superseded-request replies after reset without touching the new run',()=>{
  const ports=[];
  const client=new FleetClient(fleetFixture(),()=>{const port={onmessage:null,onerror:null,sent:[],terminated:false,
    postMessage(m){this.sent.push(m);},terminate(){this.terminated=true;}};ports.push(port);return port;});
  client.start();const first=ports[0].sent[0],oldPlanner=ports[1];client.reset();const current=ports[2].sent[0],planner=ports[3];
  client.receive({runId:first.runId,requestId:first.requestId,state:'failed',error:'old error',done:true});
  assert.equal(client.getSnapshot().runId,current.runId);assert.equal(client.getSnapshot().error,'');
  const snapshot=new FleetEngine(fleetFixture(),current.runId).getSnapshot();
  client.receive({runId:current.runId,requestId:current.requestId,snapshot,plan:{label:'new plan',activities:[],end:0,diagnosis:''},actual:{current:{start:1,finish:null}},state:'idle',done:true});
  assert.equal(client.getSnapshot().history.checkpoints.length,1);
  assert.equal(client.getSnapshot().displayFleet.digest,snapshot.digest);
  client.receive({runId:first.runId,requestId:first.requestId,plan:{label:'stale plan'},actual:{stale:{}},events:[{id:'old-event',runId:first.runId,sequence:1,instant:1,kind:'task-started',serialId:'A100-001',label:'stale',
    entityIds:['A100-001'],causeEventIds:[],payloadVersion:1}],state:'idle',done:true});
  assert.equal(client.getSnapshot().plan.label,'new plan');assert.deepEqual(Object.keys(client.getSnapshot().actual),['current']);
  assert.equal(client.getSnapshot().history.events.length,0,'an old worker cannot repopulate a reset run ledger');
  oldPlanner.onmessage({data:{runId:first.runId,requestId:0,plan:{label:'old forecast'},done:true,state:'idle'}});
  assert.equal(client.getSnapshot().plan.label,'new plan');
  planner.onmessage({data:{runId:current.runId,requestId:0,plan:{label:'background plan'},snapshot:{bad:'future'},actual:{future:{}},done:true,state:'idle'}});
  assert.equal(client.getSnapshot().plan.label,'background plan');assert.equal(client.getSnapshot().fleet,snapshot);assert.deepEqual(Object.keys(client.getSnapshot().actual),['current']);
  client.command('run');const request=ports[2].sent.at(-1);
  client.receive({runId:current.runId,requestId:request.requestId,snapshot:{...snapshot,instant:snapshot.instant+3600000},state:'computing',done:false});
  assert.equal(client.getSnapshot().fleet,snapshot);assert.equal(client.getSnapshot().progressInstant,snapshot.instant+3600000);
  assert.equal(client.getSnapshot().history.checkpoints.length,2,'worker progress is recorded without committing it as live');
  assert.equal(client.setHistoryCursor(snapshot.instant+3600000),true);
  assert.equal(client.getSnapshot().displayFleet.instant,snapshot.instant+3600000);
  assert.equal(client.getSnapshot().fleet,snapshot,'historical selection does not replace live state');
  client.receive({runId:current.runId,requestId:current.requestId,snapshot:null,state:'failed',error:'stale request',done:true});
  assert.notEqual(request.requestId,current.requestId);assert.equal(client.getSnapshot().error,'');
  assert.ok(ports[0].terminated);client.reset();assert.equal(client.getSnapshot().plan,null);assert.deepEqual(client.getSnapshot().actual,{});
  assert.equal(client.getSnapshot().history.checkpoints.length,0);assert.equal(client.getSnapshot().history.cursor,null);client.dispose();
});
