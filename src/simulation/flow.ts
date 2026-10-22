import {TaskEngine} from './engine.ts';
import {a100Pilot,a100Materials,a100Resources,a100CostRates} from './fixtures/a100.ts';
import {Inventory} from './inventory.ts';
import type {InventoryPlan,InventorySnapshot,MaterialPosting} from './inventory.ts';
import {ResourceManager} from './resources.ts';
import type {ResourcePlan,ResourceSnapshot,ResourcePosting} from './resources.ts';
import {ReceivingJobs} from './logistics.ts';
import type {HandlingSnapshot,HandlingPosting} from './logistics.ts';
import {compileCalendar, defaultCalendar, calendarStateAt, localInstant} from './calendar.ts';
import {route, stationPoses, transfers, transferPose} from './transfers.ts';
import type {Transfer} from './transfers.ts';
import type {DisruptionPlan} from './disruptions.ts';
import type {PilotDefinition, PilotSnapshot, TaskDefinition} from './tasks.ts';
import {buildings} from '../demo/campus.ts';
import {defaultStationBufferMs,stationBufferDeadline} from './station-buffer.ts';
import type {ExperimentSettings} from './experiments.ts';
import type {CostRates} from './costs.ts';
import {validateCostRates} from './costs.ts';
import type {ScenarioIdentity} from './scenario.ts';
import {sampleTask,validateVariability} from './random.ts';
import type {VariabilityPlan,RealizedDraw} from './random.ts';

export const fleetBuildings=buildings.map(b=>b.id==='assembly'?{...b,
  northDoor:{centerOffsetM:144,widthM:90,heightM:24},westDoor:{centerOffsetM:140,widthM:110,heightM:24}}
  :b.id==='receiving'?{...b,centerM:[-395,-30] as [number,number]}:b);

export type FleetConfig={name:string;recipe:PilotDefinition;orders:readonly {serialId:string;releaseAt:number;dueAt?:number}[];costRates?:CostRates;scenario?:ScenarioIdentity;variability?:VariabilityPlan;
  wipLimit:number;tugCount:number;queueCapacity:number;eventLimit:number;materials:InventoryPlan;resources:ResourcePlan;stationBufferMs?:number;stationBuffersMs?:Readonly<Record<string,number>>;holdStationBuffers?:boolean;experiment?:ExperimentSettings;
  disruptions?:DisruptionPlan;scheduleReference?:{label:string;recipe:PilotDefinition;materials:InventoryPlan;resources:ResourcePlan}};
export type FlowEvent={runId:string;sequence:number;instant:number;kind:string;serialId:string;
  id:string;entityIds:readonly string[];causeEventIds:readonly string[];payloadVersion:1;taskId?:string;
  transferId?:string;fromSlot?:string;toSlot?:string;tugId?:string;segments?:readonly string[];label:string;
  material?:MaterialPosting;resource?:ResourcePosting;handling?:HandlingPosting};
export type FleetTransfer={id:string;serialId:string;taskId:string;routeId:string;fromSlot:string;toSlot:string;
  start:number;end:number;clearAt:number;cleared:boolean;tugId:string;segments:readonly string[];startEventId:string};
export type FleetAircraft={id:string;admittedAt:number;slot:string;state:'queued'|'buffering'|'working'|'off-shift'|'blocked'|'transferring'|'offsite'|'delivered';
  reasons:readonly string[];flowBuffered?:boolean;stationBufferUntil?:number|null;tasks:readonly TaskDefinition[];pilot:PilotSnapshot};
export type FleetSnapshot={runId:string;revision:number;instant:number;status:'active'|'complete'|'blocked'|'horizon-reached'|'event-limit';
  diagnosis:string;aircraft:readonly FleetAircraft[];slots:readonly {id:string;occupiedBy:string|null;reservedBy:string|null}[];
  transfers:readonly FleetTransfer[];admitted:number;delivered:number;wip:number;upstream:number;unreleased:number;
  inventory:InventorySnapshot;resources:ResourceSnapshot;logistics:HandlingSnapshot;admissionBlockers:readonly string[];
  nextEventInstant:number|null;eventCount:number;operationCount:number;digest:string;history:readonly FlowEvent[]};

export const queueSlots=['queue-1','queue-2','queue-3'];
queueSlots.forEach((id,i)=>{stationPoses[id]={position:[-184+i*84,-55],heading:0,label:`Incoming queue ${i+1}`};});
stationPoses['delivery-2']={position:[420,370],heading:0,label:'Delivery stand 02'};
/** The original interior perimeter sweeps occupied Bay01. The fleet uses real
 * north/west door openings and an exterior lane; no occupied bay is an aisle. */
export const fleetRoutes:Record<string,Transfer>={...transfers,
  'bay-3-to-4':route('bay-3-to-4','bay-3','bay-4',[[104,-145],[104,-295],[-292.5,-295],[-292.5,110],[-220,110],[-184,85]]),
  ...Object.fromEntries(queueSlots.map((id,i)=>[`${id}-to-bay-1`,route(`${id}-to-bay-1`,id,'bay-1',
    [[-184+i*84,-55],[-184+i*84,5],[-225,5],[-225,-145],[-184,-145]])])),
  'flightline-to-delivery-2':route('flightline-to-delivery-2','flightline','delivery-2',[[230,280],[300,280],[365,370],[420,370]]),
  'delivery-2-departure':route('delivery-2-departure','delivery-2','departed',[[420,370],[470,370],[520,370]]),
};

export function fleetFixture(name:'baseline'|'slow-bay-3'|'late-engines'|'limited-inspectors'|'receiving-demo'|'wing-crane-outage'|'inspection-rework'='baseline',count=24,days=90):FleetConfig {
  const endDate=days===366?'2028-01-05':'2027-04-04';
  const calendar=days===366?compileCalendar(defaultCalendar,'2027-01-04','2028-01-06'):a100Pilot.calendar;
  const recipe={...a100Pilot,calendar,end:localInstant(`${endDate}T06:00`,calendar.timeZone),
    tasks:a100Pilot.tasks.map(task=>({...task,durationMs:task.durationMs*(name==='slow-bay-3'&&task.stationId==='bay-3'&&task.kind!=='transfer'?4:1)}))};
  const dates=calendar.shifts.filter(s=>s.label===calendar.shifts[0]?.label).map(s=>s.start).filter(t=>t>=recipe.start&&t<recipe.end);
  let resources:ResourcePlan=name==='limited-inspectors'?{...a100Resources,crewsByShift:Object.fromEntries(Object.entries(a100Resources.crewsByShift)
    .map(([shift,pools])=>[shift,{...pools,quality:2}]))}:a100Resources;
  if(name==='wing-crane-outage')resources={...resources,outages:[{id:'wing-crane-maintenance',equipmentId:'wing-crane',
    start:localInstant('2027-01-06T12:00',calendar.timeZone),end:localInstant('2027-01-07T08:00',calendar.timeZone)}]};
  const materials=a100Materials(dates,['receiving-demo','wing-crane-outage','inspection-rework'].includes(name)?1:count,name==='late-engines'||name==='receiving-demo');
  if(name==='receiving-demo')materials.receipts=materials.receipts.map(r=>({...r,inspectionNotBefore:r.at+5*3600000}));
  const disruptions:DisruptionPlan={quality:{seed:name==='inspection-rework'?208:42,
    failureProbabilityByTask:name==='inspection-rework'?{'inspect-structure':0.5}:{},maxRepairCycles:2}};
  return {name:name==='receiving-demo'?'Engine kit · delayed inspection':name==='wing-crane-outage'?'Wing-crane outage · recovery Jan07 08:00'
    :name==='inspection-rework'?'Inspection rework · seeded checks':name==='baseline'?`Baseline · ${count} orders`:name==='late-engines'?'Late engines · arrive Jan25'
    :name==='limited-inspectors'?'Simultaneous releases · 2 inspectors':'Slow Bay03 · 4× work',recipe,
    orders:Array.from({length:['receiving-demo','wing-crane-outage','inspection-rework'].includes(name)?1:count},(_,i)=>({serialId:`A100-${String(i+1).padStart(3,'0')}`,
      releaseAt:name==='limited-inspectors'?recipe.start:dates[i*2]})),
    materials,resources,disruptions,costRates:structuredClone(a100CostRates),...(name==='baseline'?{holdStationBuffers:true}:{}),wipLimit:12,tugCount:2,queueCapacity:3,eventLimit:250000,
    ...(name==='baseline'?{}:{scheduleReference:{label:'Nominal capacity plan · same orders / receipt dates · standard work, crew and inspection',
      recipe:{...recipe,tasks:a100Pilot.tasks},resources:a100Resources,
      materials:{...materials,receipts:materials.receipts.map(({inspectionNotBefore:_window,...receipt})=>receipt)}}})};
}

type AircraftRecord={id:string;admittedAt:number;slot:string;engine:TaskEngine;readyAt:number|null;bufferDeadline:number|null;historyRead:number;delivered:boolean;grant:string|null};
type Slot={id:string;occupiedBy:string|null;reservedBy:string|null};
const stopStatuses=['complete','blocked','horizon-reached','event-limit'];
function compare(a:string,b:string){return a<b?-1:a>b?1:0;}

/** Finite flow wraps the tested task engine; only this class owns occupancy. */
export class FleetEngine {
  readonly config:FleetConfig;
  readonly runId:string;
  private instant:number;
  private aircraft:AircraftRecord[]=[];
  private slots:Slot[]=[];
  private active:FleetTransfer[]=[];
  private events:FlowEvent[]=[];
  private orderIndex=0;
  private revision=0;
  private operationCount=0;
  private digest=2166136261;
  private failure='';
  private deadlockReason='';
  private snapshot!:FleetSnapshot;
  private inventory:Inventory;
  private resources:ResourceManager;
  private handling:ReceivingJobs;
  private options:{planning?:boolean;onDraw?:(draw:RealizedDraw)=>void};
  constructor(config:FleetConfig,runId='fleet-1',options:{planning?:boolean;onDraw?:(draw:RealizedDraw)=>void}={}) {
    this.options={...options};
    if(config.variability)validateVariability(config.variability);
    const rates=structuredClone(config.costRates??a100CostRates);validateCostRates(rates);
    for(const order of config.orders)if(order.dueAt!==undefined&&(!Number.isSafeInteger(order.dueAt)||order.dueAt<order.releaseAt))throw new RangeError('Order due date must be at or after release.');
    const costRates=Object.freeze({...rates,materialUnitCents:Object.freeze({...rates.materialUnitCents}),overtimeShiftLabels:Object.freeze([...rates.overtimeShiftLabels])});
    if(config.stationBuffersMs)for(const value of Object.values(config.stationBuffersMs))if(!Number.isSafeInteger(value)||value<0)throw new RangeError('Station buffers must be nonnegative integer milliseconds.');
    if(!Number.isSafeInteger(config.stationBufferMs??defaultStationBufferMs)||(config.stationBufferMs??defaultStationBufferMs)<0)
      throw new RangeError('Station buffer must be nonnegative integer milliseconds.');
    if(config.orders.length>60||new Set(config.orders.map(o=>o.serialId)).size!==config.orders.length)throw new RangeError('Order serial IDs must be unique; maximum60.');
    for(const [label,value,max] of [['WIP',config.wipLimit,20],['tugs',config.tugCount,2],['queue',config.queueCapacity,3],['event limit',config.eventLimit,250000]] as const)
      if(!Number.isSafeInteger(value)||value<0||value>max||(label==='event limit'&&value===0))throw new RangeError(`Invalid ${label} capacity.`);
    if(config.recipe.end-config.recipe.start>366*86400000+3600000)throw new RangeError('Horizon exceeds366 local days.');
    for(const o of config.orders)if(!o.serialId||!Number.isSafeInteger(o.releaseAt)||o.releaseAt<config.recipe.start||o.releaseAt>=config.recipe.end)throw new RangeError('Invalid order release.');
    for(const task of config.recipe.tasks){
      if(!task.stationId||!stationPoses[task.stationId])throw new RangeError(`Unknown task station: ${task.stationId}`);
      if(task.kind==='transfer'&&!fleetRoutes[task.transferRouteId!])throw new RangeError(`Unknown transfer route: ${task.transferRouteId}`);
    }
    for(const outage of config.resources.outages??[])if(outage.start<config.recipe.start||outage.end>config.recipe.end)
      throw new RangeError(`Equipment outage ${outage.id} must be inside the run horizon.`);
    // Validate and freeze recipe/calendar with the existing engine, without starting work.
    const validated=new TaskEngine(config.recipe,'validate',()=>false).definition;
    const disruptions=config.disruptions?Object.freeze({...config.disruptions,quality:Object.freeze({...config.disruptions.quality,
      failureProbabilityByTask:Object.freeze({...config.disruptions.quality.failureProbabilityByTask})})}):undefined;
    this.config=Object.freeze({...config,costRates,disruptions,variability:config.variability?Object.freeze({...config.variability}):undefined,recipe:validated,orders:Object.freeze(config.orders.map(o=>Object.freeze({...o})).sort((a,b)=>a.releaseAt-b.releaseAt||compare(a.serialId,b.serialId)))});
    this.runId=runId;this.instant=config.recipe.start;
    this.inventory=new Inventory(config.materials,posting=>this.record(posting.kind,posting.serialId,
      posting.receiptId?`${posting.kind==='material-delivered'?'Usable at destination':'Arrived at receiving'} · ${posting.receiptId}`:`${posting.kind} · ${posting.taskId}`,
      {taskId:posting.taskId,causeEventIds:posting.causeEventIds,material:posting})??posting.id);
    this.resources=new ResourceManager(config.resources,this.config.recipe.calendar,posting=>this.record(posting.kind,posting.serialId,
      `${posting.kind==='resource-allocated'?'Assigned':'Released'} crew and equipment · ${posting.taskId}`,
      {taskId:posting.taskId,causeEventIds:posting.causeEventIds,resource:posting})??posting.id);
    if(config.materials.receipts.some(r=>r.at<config.recipe.start))throw new RangeError('Receipt precedes run start. Use opening stock.');
    this.config=Object.freeze({...this.config,materials:this.inventory.plan,resources:this.resources.plan});
    this.handling=new ReceivingJobs(this.inventory.plan,this.config.recipe.calendar,this.inventory,this.resources,
      posting=>this.record(posting.kind,'',posting.label,{taskId:posting.stage,entityIds:[posting.jobId],
        causeEventIds:posting.causeEventIds,handling:posting})??posting.id);
    this.slots=[...queueSlots.slice(0,config.queueCapacity),'bay-1','bay-2','bay-3','bay-4','bay-5','bay-6','paint','flightline','delivery','delivery-2'].map(id=>({id,occupiedBy:null,reservedBy:null}));
    this.applyOutagesAt(this.instant,false);this.dispatch();this.checkDeadlock();this.publish();
  }
  getSnapshot=()=>this.snapshot;
  getEvents=()=>this.events as readonly FlowEvent[];
  private record(kind:string,serialId:string,label:string,extra:Partial<FlowEvent>={}) {
    if(this.events.length>=this.config.eventLimit){this.failure='event-limit';return null;}
    const event=Object.freeze({runId:this.runId,sequence:this.events.length+1,instant:this.instant,kind,serialId,label,
      id:`${this.runId}:flow:${this.events.length+1}`,entityIds:[serialId],causeEventIds:[],payloadVersion:1 as const,...extra});
    this.events.push(event);
    if(!['calendar-boundary','task-paused','task-resumed'].includes(kind))this.operationCount++;
    // Incremental deterministic checksum; cryptographic hashing is evidence-only.
    const {id:_id,runId:_runId,causeEventIds:_causes,...stable}=event;
    const material=event.material?{kind:event.material.kind,instant:event.material.instant,serialId:event.material.serialId,
      taskId:event.material.taskId,receiptId:event.material.receiptId,allocations:event.material.allocations}:undefined;
    const resource=event.resource?{kind:event.resource.kind,instant:event.resource.instant,serialId:event.resource.serialId,
      taskId:event.resource.taskId,shift:event.resource.shift,crews:event.resource.crews,equipment:event.resource.equipment}:undefined;
    const handling=event.handling?{kind:event.handling.kind,instant:event.handling.instant,jobId:event.handling.jobId,stage:event.handling.stage}:undefined;
    for(const char of JSON.stringify({...stable,resource:undefined,material:undefined,handling:undefined,...(material?{material}:{}),...(resource?{resource}:{}),...(handling?{handling}:{})}))
      this.digest=Math.imul(this.digest^char.charCodeAt(0),16777619)>>>0;
    return event.id;
  }
  private collect(a:AircraftRecord) {
    const history=a.engine.getSnapshot().history;
    for(const event of history.slice(a.historyRead)){
      const tow=this.active.find(t=>t.serialId===a.id&&t.taskId===event.payload.taskId);
      this.record(event.kind,a.id,event.payload.label,{id:event.id,taskId:event.payload.taskId,entityIds:event.entityIds,
        causeEventIds:[...event.causeEventIds,...(event.kind==='task-started'&&tow?.startEventId?[tow.startEventId]:[])]});
    }
    a.historyRead=history.length;
  }
  private wip(){return this.aircraft.filter(a=>!a.delivered).length;}
  private admit() {
    while(!this.failure&&this.instant<this.config.recipe.end&&this.orderIndex<this.config.orders.length) {
      const order=this.config.orders[this.orderIndex];
      const slot=this.slots.find(s=>s.id.startsWith('queue-')&&!s.occupiedBy&&!s.reservedBy);
      if(order.releaseAt>this.instant||!slot||this.wip()>=this.config.wipLimit||this.active.some(t=>t.segments.includes('intake')))return;
      // Bind the major-section kit to this serial at admission; alignment issues it once.
      if(!this.inventory.reserve(`${order.serialId}/align`,order.serialId,'align',{'major-section-kit':1},this.instant))return;
      const intakeId=`${slot.id}-to-bay-1`,intake=fleetRoutes[intakeId];
      const second=this.orderIndex%2===1;
      const tasks:TaskDefinition[]=[{id:'intake',label:'Tow incoming sections to Bay01',stationId:slot.id,kind:'transfer',
        transferRouteId:intakeId,durationMs:intake.durationMs,durationMode:'elapsed',prerequisites:[],completionMilestones:[],
        crewRequirements:{logistics:2},equipmentRequirements:{'tow-tug':1},holdEquipmentOffShift:true,materialRequirements:{}},
        ...this.config.recipe.tasks.map(task=>({...task,
          prerequisites:task.prerequisites.length?task.prerequisites:['intake'],
          stationId:second&&task.stationId==='delivery'?'delivery-2':task.stationId,
          transferRouteId:second&&task.id==='flightline-to-delivery'?'flightline-to-delivery-2':second&&task.id==='delivery-departure'?'delivery-2-departure':task.transferRouteId,
          durationMs:second&&task.id==='flightline-to-delivery'?fleetRoutes['flightline-to-delivery-2'].durationMs:
            task.id==='bay-3-to-4'?fleetRoutes['bay-3-to-4'].durationMs:task.durationMs}))];
      let a:AircraftRecord|undefined;
      const engine=new TaskEngine({...this.config.recipe,serialId:order.serialId,start:this.instant,tasks},`${this.runId}/${order.serialId}`,
        task=>!!a&&(task.kind==='transfer'?a.grant===task.id:a.slot===task.stationId),{
          missing:task=>this.inventory.missing(`${order.serialId}/${task.id}`,task.materialRequirements),
          issue:(task,instant)=>{
            if(!Object.keys(task.materialRequirements).length)return [];
            const key=`${order.serialId}/${task.id}`;
            if(!this.inventory.reserve(key,order.serialId,task.id,task.materialRequirements,instant))return null;
            return [this.inventory.issue(key,instant)!];
          }},{blockers:(task,instant)=>this.resources.blockers(task,instant),
          canEverAcquire:task=>this.resources.canEverAcquire(task),
          acquire:(task,serialId,instant)=>this.resources.acquire(task,serialId,instant),
          release:(task,serialId,instant,keepEquipment,causes)=>this.resources.release(task,serialId,instant,keepEquipment,causes),
          outageBlockers:(task,instant)=>this.resources.outageBlockers(task,instant)},
        {quality:this.config.disruptions?.quality,sampleDuration:this.config.variability?(task,attempt)=>{
          const draw=sampleTask(this.config.variability!,order.serialId,task,attempt);if(draw)this.options.onDraw?.(draw);return draw?.value??task.durationMs;
        }:undefined});
      a={id:order.serialId,admittedAt:this.instant,slot:slot.id,engine,readyAt:null,bufferDeadline:null,historyRead:0,delivered:false,grant:null};
      slot.occupiedBy=a.id;this.aircraft.push(a);this.orderIndex++;
      this.record('admitted',a.id,`Admitted to ${slot.id}`,{toSlot:slot.id});
    }
  }
  private readyTransfer(a:AircraftRecord) {
    const snapshot=a.engine.getSnapshot();
    return a.engine.getTaskDefinitions().find(task=>task.kind==='transfer'&&snapshot.tasks.some(t=>t.taskId===task.id&&t.state==='pending'&&t.waitingFor.length===0));
  }
  private bufferUntil(a:AircraftRecord){
    return a.bufferDeadline??this.instant;
  }
  private segments(routeId:string) {
    if(routeId.startsWith('queue-'))return ['intake','north-row'];
    if(['bay-1-to-2','bay-2-to-3'].includes(routeId))return ['north-row'];
    if(routeId==='bay-3-to-4')return ['north-row','west-perimeter','south-row'];
    if(['bay-4-to-5','bay-5-to-6'].includes(routeId))return ['south-row'];
    return ['east-apron']; // Conservative entire apron lock, including both delivery stands.
  }
  private blockers(task:TaskDefinition) {
    const r=fleetRoutes[task.transferRouteId!],destination=this.slots.find(s=>s.id===r.toStation);
    const reasons:string[]=[];
    if(destination&&(destination.occupiedBy||destination.reservedBy))reasons.push(`Waiting for downstream space · ${stationPoses[r.toStation].label} · ${destination.occupiedBy??destination.reservedBy}`);
    if(this.active.length>=this.config.tugCount)reasons.push('Waiting for a tow tug');
    if(this.active.some(t=>t.segments.some(s=>this.segments(r.id).includes(s))))reasons.push('Waiting for reserved transfer corridor');
    if(this.handling.snapshot(this.instant).segments.some(s=>this.segments(r.id).includes(s)))reasons.push('Waiting for kit forklift corridor reservation');
    if(calendarStateAt(this.config.recipe.calendar,this.instant).status!=='working')reasons.push('Waiting for a staffed working period');
    reasons.push(...this.resources.blockers(task,this.instant));
    return reasons;
  }
  private clearOffset(routeId:string) {
    const r=fleetRoutes[routeId],p=stationPoses[r.fromStation].position;
    const queue=r.fromStation.startsWith('queue-');
    const sx=queue?34:r.fromStation==='paint'?44:50,sz=queue?6:r.fromStation==='paint'?40:60;
    // Conservative rectangle +2m for tow gear. Last intersection ensures that a
    // turning tail cannot re-enter a source released by an earlier corner.
    let last=0;
    for(let t=0;t<r.durationMs;t+=250) {
      const pose=transferPose(r,t),[x,,z]=pose.positionM,c=Math.abs(Math.cos(pose.heading)),s=Math.abs(Math.sin(pose.heading));
      const hx=34*c+(queue?6:29.2)*s,hz=34*s+(queue?6:29.2)*c;
      if(Math.abs(x-p[0])<=sx+hx&&Math.abs(z-p[1])<=sz+hz)last=t;
    }
    return Math.min(r.durationMs,last+250);
  }
  private dispatch() {
    this.handling.settle(this.instant);
    if(this.instant<this.config.recipe.end)this.handling.dispatch(this.instant,this.active.flatMap(t=>t.segments));
    this.admit();
    if(this.failure||this.instant>=this.config.recipe.end)return;
    const candidates=this.aircraft.filter(a=>!a.delivered&&!a.grant).map(a=>({a,task:this.readyTransfer(a)})).filter(item=>item.task);
    for(const {a} of candidates)if(a.readyAt===null){
      a.readyAt=this.instant;
      a.bufferDeadline=a.slot.startsWith('queue-')?this.instant:stationBufferDeadline(this.config.recipe.calendar,this.instant,this.config.stationBuffersMs?.[a.slot==='delivery-2'?'delivery':a.slot]??this.config.stationBufferMs??defaultStationBufferMs);
    }
    candidates.sort((x,y)=>x.a.readyAt!-y.a.readyAt!||compare(x.a.id,y.a.id));
    for(const {a,task} of candidates) {
      if((this.options.planning||this.config.holdStationBuffers)&&this.instant<this.bufferUntil(a))continue;
      if(this.blockers(task!).length)continue;
      const r=fleetRoutes[task!.transferRouteId!],to=this.slots.find(s=>s.id===r.toStation);
      if(r.fromStation!==a.slot)throw new RangeError(`Route source does not match ${a.id}'s occupied station.`);
      const tugId=Array.from({length:this.config.tugCount},(_,i)=>`tug-${i+1}`).find(id=>!this.active.some(t=>t.tugId===id))!;
      const t:FleetTransfer={id:`${a.id}/${task!.id}`,serialId:a.id,taskId:task!.id,routeId:r.id,fromSlot:a.slot,toSlot:r.toStation,
        start:this.instant,end:this.instant+r.durationMs,clearAt:this.instant+this.clearOffset(r.id),cleared:false,tugId,segments:this.segments(r.id),startEventId:''};
      if(to)to.reservedBy=a.id;
      this.active.push(t);a.grant=task!.id;a.readyAt=null;a.bufferDeadline=null;
      t.startEventId=this.record('transfer-started',a.id,`${r.fromStation} → ${r.toStation}`,{transferId:t.id,fromSlot:t.fromSlot,toSlot:t.toSlot,tugId,segments:t.segments})??'';
      a.engine.redispatch();this.collect(a);
    }
  }
  private nextInstant() {
    if(this.failure||this.deadlockReason)return null;
    const values:number[]=[];
    // A closed final weekend is still elapsed run time. Unfinished work must
    // reach the requested cutoff even when no shift/receipt precedes it.
    if(this.instant<this.config.recipe.end)values.push(this.config.recipe.end);
    const receipt=this.inventory.nextReceipt(this.instant);if(receipt!==null&&receipt<=this.config.recipe.end)values.push(receipt);
    const handling=this.handling.nextInstant(this.instant);if(handling!==null&&handling<=this.config.recipe.end)values.push(handling);
    const outage=this.resources.nextOutageBoundary(this.instant);if(outage!==null&&outage<=this.config.recipe.end)values.push(outage);
    const nextOrder=this.config.orders.slice(this.orderIndex).find(o=>o.releaseAt>this.instant);if(nextOrder)values.push(nextOrder.releaseAt);
    for(const a of this.aircraft)if(!a.delivered){const next=a.engine.getSnapshot().nextEventInstant;if(next!==null)values.push(next);}
    // Wake at the allowance boundary even if no production event occurs there.
    for(const a of this.aircraft)if(a.readyAt!==null){const until=this.bufferUntil(a);if(until>this.instant)values.push(until);}
    for(const t of this.active){values.push(t.end);if(!t.cleared)values.push(t.clearAt);}
    return values.length?Math.min(...values):null;
  }
  private settle(instant:number) {
    this.instant=instant;
    this.handling.settle(instant);
    for(const a of this.aircraft)if(!a.delivered){a.engine.advanceTo(instant);this.collect(a);}
    this.applyOutagesAt(instant,true);
    for(const t of [...this.active]) {
      if(!t.cleared&&t.clearAt<=instant){const source=this.slots.find(s=>s.id===t.fromSlot)!;source.occupiedBy=null;t.cleared=true;
        this.record('source-cleared',t.serialId,`Tail clear of ${t.fromSlot}`,{transferId:t.id,fromSlot:t.fromSlot,causeEventIds:[t.startEventId]});}
      if(t.end<=instant){
        const a=this.aircraft.find(a=>a.id===t.serialId)!;
        const dest=this.slots.find(s=>s.id===t.toSlot);
        if(dest){dest.reservedBy=null;dest.occupiedBy=a.id;}
        a.slot=t.toSlot;a.grant=null;
        this.active=this.active.filter(candidate=>candidate!==t);
        const arrival=this.record('transfer-arrived',a.id,`Arrived at ${t.toSlot}`,{transferId:t.id,toSlot:t.toSlot,causeEventIds:[t.startEventId]});
        if(t.toSlot==='departed'){a.delivered=true;this.record('delivered',a.id,'Departure completed',{causeEventIds:arrival?[arrival]:[]});}
        else {a.engine.redispatch();this.collect(a);}
      }
    }
    // Receipts and arrivals settle before a stable serial/task dispatch pass.
    for(const a of this.aircraft)if(!a.delivered){a.engine.redispatch();this.collect(a);}
    this.dispatch();
    this.checkDeadlock();
  }
  private applyOutagesAt(instant:number,pauseTasks:boolean){
    for(const transition of this.resources.outageTransitions(instant)){
      const id=this.record(transition.edge==='start'?'equipment-outage-started':'equipment-outage-ended',transition.equipmentId,
        `${transition.equipmentId.replaceAll('-',' ')} outage ${transition.edge==='start'?'started':'recovered'} · ${transition.id}`,
        {taskId:transition.id,entityIds:[transition.equipmentId]});
      if(pauseTasks&&transition.edge==='start'&&id)for(const aircraft of this.aircraft)if(!aircraft.delivered){
        aircraft.engine.pauseUnavailableEquipment(id);this.collect(aircraft);
      }
    }
  }
  private checkDeadlock(){
    const live=this.aircraft.filter(a=>!a.delivered);
    if(this.handling.snapshot(this.instant).jobs.some(job=>job.state==='working'))return;
    if(this.active.length||!live.length||calendarStateAt(this.config.recipe.calendar,this.instant).status!=='working')return;
    if(live.some(a=>a.engine.getSnapshot().tasks.some(t=>t.state==='waiting-material')))return;
    if(live.some(a=>a.engine.getSnapshot().tasks.some(t=>t.state==='waiting-day-window')))return;
    const impossible=live.flatMap(a=>{
      const waiting=a.engine.getSnapshot().tasks.filter(task=>task.state==='waiting-resource');
      if(!waiting.length)return[];
      const definitions=new Map(a.engine.getTaskDefinitions().map(task=>[task.id,task]));
      return waiting.filter(task=>!this.resources.canEverAcquire(definitions.get(task.taskId)!)).map(task=>({a,task}));
    });
    if(impossible.length&&!live.some(a=>a.engine.getSnapshot().tasks.some(task=>task.state==='running'))){
      const first=impossible[0];this.deadlockReason=`No progress: ${first.a.id} · ${first.task.label} · ${(first.task.resourceBlockers??[]).join('; ')||'required capacity is unavailable on every shift'}`;
      return;
    }
    if(live.some(a=>(this.options.planning||this.config.holdStationBuffers)&&a.readyAt!==null&&this.instant<this.bufferUntil(a)))return;
    if(live.every(a=>!a.engine.getSnapshot().tasks.some(t=>t.startedAt!==null&&t.state!=='complete'))){
      this.deadlockReason=`No eligible task or transfer: ${live.map(a=>`${a.id} at ${a.slot}`).join(', ')}. Check downstream space and recipe station routing.`;
    }
  }
  /** Bounded worker slice. No skipped events when returning early. */
  advanceTo(to:number,maxInstants=Infinity) {
    if(!Number.isSafeInteger(to)||to<this.instant||to>this.config.recipe.end)throw new RangeError('Invalid fleet target.');
    if(this.failure||this.deadlockReason||this.snapshot?.status==='blocked')return this.snapshot;
    if(this.snapshot?.status==='complete'){this.instant=to;this.publish();return this.snapshot;}
    let count=0,next=this.nextInstant();
    while(next!==null&&next<=to&&count++<maxInstants&&!this.failure&&!this.deadlockReason){this.settle(next);next=this.nextInstant();}
    if(count<=maxInstants&&!this.failure&&!this.deadlockReason&&this.instant<to)this.settle(to);
    this.publish();return this.snapshot;
  }
  private publish() {
    const delivered=this.aircraft.filter(a=>a.delivered).length,wip=this.wip();
    const allDone=delivered===this.config.orders.length;
    const noProgress=(this.config.wipLimit===0||this.config.queueCapacity===0||this.config.tugCount===0)&&!allDone;
    const next=this.nextInstant();
    const admissionBlockers=this.config.orders[this.orderIndex]?.releaseAt<=this.instant
      ?this.inventory.missing(`${this.config.orders[this.orderIndex].serialId}/align`,{'major-section-kit':1}):[];
    const stranded=!allDone&&next===null;
    const status=this.failure?'event-limit':allDone?'complete':this.deadlockReason||noProgress?'blocked':this.instant>=this.config.recipe.end?'horizon-reached':stranded?'blocked':'active';
    const diagnosis=this.failure?'Event limit reached; run is incomplete':noProgress?`No progress: WIP limit ${this.config.wipLimit}, queue ${this.config.queueCapacity}, tow tugs ${this.config.tugCount}`
      :this.deadlockReason?this.deadlockReason
      :status==='horizon-reached'?'Horizon reached with unfinished orders':stranded?(admissionBlockers.join('; ')||'No eligible work or future event; unresolved station/route dependencies'):'';
    this.snapshot={runId:this.runId,revision:++this.revision,instant:this.instant,status,diagnosis,
      aircraft:this.aircraft.map(a=>{const pending=this.readyTransfer(a),pilot=a.engine.getSnapshot();
        const holding=!!pending&&!!this.config.holdStationBuffers&&this.instant<this.bufferUntil(a);
        const reasons=pending?(holding?[]:this.blockers(pending)):pilot.tasks.flatMap(t=>[...(t.materialBlockers??[]),...(t.resourceBlockers??[])]);
        const qualityHold=pilot.tasks.find(task=>task.state==='quality-hold');
        if(qualityHold)reasons.push(`Quality hold · ${qualityHold.label} at ${a.slot}`);
        const state=a.delivered?'delivered':a.grant?'transferring':a.slot.startsWith('queue-')?'queued':holding?'buffering':pending?'blocked':pilot.tasks.some(t=>t.taskId==='flight'&&t.state==='running')?'offsite':pilot.tasks.some(t=>t.state==='running')?'working':reasons.length?'blocked':'off-shift';
        return {id:a.id,admittedAt:a.admittedAt,slot:a.slot,state,reasons,flowBuffered:!!pending&&this.instant<this.bufferUntil(a),stationBufferUntil:pending?a.bufferDeadline:null,tasks:a.engine.getTaskDefinitions(),
          pilot:{...pilot,history:pilot.history.slice(-16)}};}),
      slots:this.slots.map(s=>({...s})),transfers:this.active.map(t=>({...t})),admitted:this.aircraft.length,delivered,wip,
      upstream:this.config.orders.slice(this.orderIndex).filter(o=>o.releaseAt<=this.instant).length,
      unreleased:this.config.orders.length-this.orderIndex,
      inventory:this.inventory.snapshot(),resources:this.resources.snapshot(this.instant),logistics:this.handling.snapshot(this.instant),admissionBlockers,
      nextEventInstant:stopStatuses.includes(status)?null:next,eventCount:this.events.length,operationCount:this.operationCount,
      digest:this.digest.toString(16).padStart(8,'0'),history:this.events.slice(-32)};
  }
}
