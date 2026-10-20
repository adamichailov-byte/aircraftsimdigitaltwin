import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFlowTimeline,calendarTicks,filterTimelineEvents,formatTimelineDuration} from '../src/ui/flow-timeline-data.ts';
import {fleetFixture,FleetEngine} from '../src/simulation/flow.ts';
import {localInstant} from '../src/simulation/calendar.ts';

const start=Date.UTC(2027,0,4,12),hour=3_600_000;
function event(kind,instant,serialId='A100-001',extra={}){
  return {runId:'timeline-test',sequence:instant,id:`${kind}-${instant}`,instant,kind,serialId,entityIds:[serialId],
    causeEventIds:[],payloadVersion:1,label:kind,...extra};
}
function fakeFleet({state='working',at=start+4*hour,taskState='running',delivered=false}={}){
  const task=(id,label,prerequisites=[],stationId='bay-1',kind='work')=>({id,label,prerequisites,stationId,kind,durationMs:hour,
    crewRequirements:{},materialRequirements:{},completionMilestones:[]});
  const tasks=[task('join','Join fuselage'),task('engines','Install engines',['join'],'bay-4')];
  const aircraft={id:'A100-001',admittedAt:start,slot:'bay-4',state:delivered?'delivered':state,reasons:[],tasks,
    pilot:{tasks:[{taskId:'join',label:'Join fuselage',state:'complete',startedAt:start,completedAt:start+hour,remainingWorkMs:0,waitingFor:[]},
      {taskId:'engines',label:'Install engines',state:taskState,startedAt:taskState==='running'?start+2*hour:null,
        completedAt:null,remainingWorkMs:hour,waitingFor:[],materialBlockers:taskState==='waiting-material'?['Engine · 0 available, 2 required']:[]}],
      status:'active',history:[]}};
  return {runId:'timeline-test',revision:1,instant:at,status:'active',diagnosis:'',aircraft:[aircraft],slots:[],transfers:[],admitted:1,
    delivered:delivered?1:0,wip:delivered?0:1,upstream:0,unreleased:0,inventory:{lots:[]},resources:{},logistics:{},
    admissionBlockers:[],nextEventInstant:null,eventCount:0,operationCount:0,digest:'test',history:[]};
}

test('timeline derives productive work, actual-duration transfers and delivery, and keeps delivered history filterable',()=>{
  const fleet=fakeFleet({at:start+5*hour,delivered:true}),events=[
    event('admitted',start),event('task-started',start,'A100-001',{taskId:'join',label:'Join fuselage'}),
    event('task-completed',start+hour,'A100-001',{taskId:'join',label:'Join fuselage'}),
    event('transfer-started',start+hour,'A100-001',{transferId:'t1',fromSlot:'bay-1',toSlot:'bay-2'}),
    event('transfer-arrived',start+2*hour,'A100-001',{transferId:'t1',fromSlot:'bay-1',toSlot:'bay-2'}),
    event('delivered',start+4*hour,'A100-001',{label:'Aircraft delivered'}),
  ];
  const history=buildFlowTimeline({fleet,events,at:fleet.instant,historical:true,from:start,to:start+5*hour});
  assert.ok(history.segments.some(item=>item.kind==='productive'&&item.taskId==='join'&&item.start===start&&item.end===start+hour));
  const transfer=history.segments.find(item=>item.kind==='transfer');
  assert.equal(transfer.start,start+hour);assert.equal(transfer.end,start+2*hour);assert.equal(transfer.from,'bay-1');assert.equal(transfer.to,'bay-2');
  assert.ok(history.segments.some(item=>item.kind==='delivery'&&item.start===start+4*hour));
  assert.deepEqual(filterTimelineEvents(history.segments,'A100-001').map(item=>item.serialId),['A100-001','A100-001','A100-001']);
  const live=buildFlowTimeline({fleet,events,at:fleet.instant,historical:false,from:start,to:start+5*hour});
  assert.equal(live.segments.length,0,'delivered assets leave the live chart but remain in recorded history');
});

test('daily start deferrals retain their recorded interval after work begins and clip in history',()=>{
  const fleet=fakeFleet({at:start+4*hour}),events=[
    event('task-deferred',start,'A100-001',{taskId:'engines'}),
    event('task-ready',start+2*hour,'A100-001',{taskId:'engines'}),
    event('task-started',start+3*hour,'A100-001',{taskId:'engines'}),
  ];
  const full=buildFlowTimeline({fleet,events,at:fleet.instant,historical:false,from:start,to:fleet.instant});
  const wait=full.segments.find(item=>item.kind==='offshift');
  assert.equal(wait.start,start);assert.equal(wait.end,start+2*hour,'daily wait ends when the window opens, even if resource dispatch is later');
  assert.match(wait.reason,/daily start window/);
  const past=buildFlowTimeline({fleet,events,at:start+hour,historical:true,from:start,to:fleet.instant});
  assert.equal(past.segments[0].end,start+hour);
});

test('missing-material waits are stationary, red-coded blockers and clip at the selected historical instant',()=>{
  const fleet=fakeFleet({state:'blocked',taskState:'waiting-material',at:start+4*hour});
  const events=[event('admitted',start),event('task-started',start,'A100-001',{taskId:'join',label:'Join fuselage'}),
    event('task-completed',start+hour,'A100-001',{taskId:'join',label:'Join fuselage'})];
  const view=buildFlowTimeline({fleet,events,at:fleet.instant,historical:true,from:start+2*hour,to:start+3*hour});
  const hold=view.segments.find(item=>item.kind==='blocked');
  assert.ok(hold);assert.equal(hold.taskId,'engines');assert.equal(hold.station,'bay-4');assert.equal(hold.start,start+2*hour);
  assert.equal(hold.end,start+3*hour);assert.match(hold.reason,/Engine/i);assert.equal(hold.clippedStart,true);assert.equal(hold.clippedEnd,true);
});

test('off-shift intervals stop at the next recorded task start instead of overlapping later work',()=>{
  const fleet=fakeFleet({at:start+6*hour,taskState:'running'}),events=[
    event('admitted',start),event('calendar-boundary',start+3*hour,'A100-001',{id:'shift-end'}),
    event('task-started',start+2*hour,'A100-001',{taskId:'engines',label:'Install engines'}),
    event('task-paused',start+3*hour,'A100-001',{taskId:'engines',label:'Install engines',causeEventIds:['shift-end']}),
    event('task-started',start+3*hour,'A100-001',{sequence:start+3*hour+1,taskId:'engines',label:'Install engines'}),
    event('task-paused',start+4*hour,'A100-001',{taskId:'engines',label:'Install engines',causeEventIds:['shift-end']}),
    event('task-started',start+5*hour,'A100-001',{taskId:'engines',label:'Install engines'}),
    event('task-completed',start+6*hour,'A100-001',{taskId:'engines',label:'Install engines'}),
  ];
  const view=buildFlowTimeline({fleet,events,at:fleet.instant,historical:true,from:start,to:start+6*hour});
  const work=view.segments.filter(item=>item.taskId==='engines'&&item.kind==='productive');
  const rest=view.segments.find(item=>item.taskId==='engines'&&item.kind==='offshift');
  assert.deepEqual(work.map(item=>[item.start,item.end]),[[start+2*hour,start+3*hour],[start+3*hour,start+4*hour],[start+5*hour,start+6*hour]]);
  assert.ok(rest);assert.equal(rest.start,start+4*hour);assert.equal(rest.end,start+5*hour);
  assert.equal(formatTimelineDuration(13*86400000),'13.0d');
  assert.equal(formatTimelineDuration(40000),'40s');
});

test('calendar ticks include day and month boundaries, and late-engine fixture exposes its real hold reason',()=>{
  const days=calendarTicks(Date.UTC(2027,0,4),Date.UTC(2027,0,8),800,'America/New_York');
  const months=calendarTicks(Date.UTC(2027,0,30),Date.UTC(2027,2,3),800,'America/New_York');
  assert.ok(months.some(tick=>tick.granularity==='month'&&tick.label.includes('Feb')));
  assert.ok(days.some(tick=>tick.granularity==='day'));
  const config=fleetFixture('late-engines',3),engine=new FleetEngine(config,'timeline-shortage');
  const target=localInstant('2027-01-25T05:30',config.recipe.calendar.timeZone);engine.advanceTo(target);
  const fleet=engine.getSnapshot(),events=engine.getEvents();
  const view=buildFlowTimeline({fleet,events,at:fleet.instant,historical:true,from:config.recipe.start,to:fleet.instant});
  assert.ok(view.segments.some(item=>item.kind==='blocked'&&/engine/i.test(item.reason)),
    'the timeline names the part holding aircraft at its station');
  assert.ok(!view.segments.some(item=>item.serialId==='A100-001'&&item.taskId==='align'&&item.kind==='offshift'&&item.end-item.start>36*3600000),
    'a completed task does not acquire a multi-day off-shift tail');
  assert.ok(!view.segments.some(item=>item.start===item.end&&item.kind!=='delivery'),'zero-duration task noise is omitted');
});
