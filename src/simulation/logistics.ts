import {addWorkingTime,calendarStateAt,nextBoundary,workingTimeBetween} from './calendar.ts';
import type {PlantCalendar} from './types.ts';
import type {Inventory,InventoryPlan,MaterialReceipt} from './inventory.ts';
import type {ResourceManager} from './resources.ts';
import type {TaskDefinition} from './tasks.ts';

/** Existing west receiving door → paved perimeter service road → east stores door.
 * The conservative loaded envelope is 16m × 5m. Both aircraft crossings are locked for the
 * whole round trip, including pauses: a deliberately conservative traffic rule. */
export const handlingRoute:readonly (readonly [number,number])[]=[[-450,-30],[-490,-30],[-490,-263],[391,-263],[391,-155],[352,-155]];
export const handlingSegments=['north-row','west-perimeter'] as const;
export const handlingSpeedMps=2;
export const handlingLengthM=handlingRoute.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-handlingRoute[i][0],p[1]-handlingRoute[i][1]),0);
export const handlingTravelMs=Math.ceil(handlingLengthM/handlingSpeedMps*1000);
const durations={inspection:2*3600000,kitting:3600000,loading:300000,transit:handlingTravelMs,unloading:300000,returning:handlingTravelMs};
type WorkStage=keyof typeof durations;
export type HandlingStage=WorkStage|'held'|'complete';
export type HandlingJob={id:string;lotId:string;sku:string;quantity:number;destination:string;arrivalAt:number;
  inspectionNotBefore:number;stage:HandlingStage;state:'waiting'|'working'|'paused'|'held'|'complete';
  remainingWorkMs:number;durationMs:number;updatedAt:number;dropAt:number|null;blockers:readonly string[];crewCount:number};
export type HandlingSnapshot={jobs:readonly HandlingJob[];carrierId:string|null;segments:readonly string[];nextEventInstant:number|null};
export type HandlingPosting={id:string;kind:string;instant:number;jobId:string;stage:HandlingStage;label:string;causeEventIds:readonly string[]};
type Job=HandlingJob&{receipt:MaterialReceipt;lease:boolean;cause:string;};
function task(id:string,crew:number,equipment=false):TaskDefinition{return {id,label:id,prerequisites:[],durationMs:1,
  crewRequirements:crew?{logistics:crew}:{},equipmentRequirements:equipment?{'kit-forklift':1}:{},materialRequirements:{},completionMilestones:[]};}

/** A bounded receipt pipeline, sharing the fleet's inventory, calendar and leases.
 * Arrivals, stage completion and resource release settle before new dispatch.
 * The carrier lease is separate from the driver so it stays parked exclusively
 * overnight while the driver releases/reacquires a real per-shift crew unit. */
export class ReceivingJobs{
  private jobs:Job[]=[];
  private carrierId:string|null=null;
  private instant:number;
  private sequence=0;
  private readonly plan:InventoryPlan;
  private readonly calendar:PlantCalendar;
  private readonly inventory:Inventory;
  private readonly resources:ResourceManager;
  private readonly emit:(event:HandlingPosting)=>string;
  constructor(plan:InventoryPlan,calendar:PlantCalendar,inventory:Inventory,resources:ResourceManager,
    emit:(event:HandlingPosting)=>string=event=>event.id){
    this.plan=plan;this.calendar=calendar;this.inventory=inventory;this.resources=resources;this.emit=emit;this.instant=calendar.start;
  }
  private post(job:Job,kind:string,label:string){
    const event:HandlingPosting={id:`handling-${++this.sequence}`,kind,instant:this.instant,jobId:job.id,stage:job.stage,label,causeEventIds:job.cause?[job.cause]:[]};
    job.cause=this.emit(event);return job.cause;
  }
  settle(at:number){
    if(at<this.instant)throw new RangeError('Handling time cannot move backwards.');
    const work=workingTimeBetween(this.calendar,this.instant,at),priorShift=calendarStateAt(this.calendar,this.instant).shift;
    this.instant=at;
    for(const job of this.jobs){
      if(job.state==='working')job.remainingWorkMs=Math.max(0,job.remainingWorkMs-work);
      job.updatedAt=at;
      if(job.state==='working'&&job.remainingWorkMs===0){
        this.resources.release(task(job.stage,job.crewCount),job.id,at);job.lease=false;
        const finished=job.stage;this.post(job,'handling-completed',`${job.id} · ${finished} complete`);
        if(finished==='unloading'){
          job.dropAt=at;this.inventory.deliver(job.id,at,job.cause);
        }
        if(finished==='inspection'&&job.receipt.held){job.stage='held';job.state='held';job.crewCount=0;job.blockers=['Quality hold · receipt has no release'];this.post(job,'handling-held',`${job.id} · quality hold`);continue;}
        const stages=Object.keys(durations) as WorkStage[],next=stages[stages.indexOf(finished as WorkStage)+1];
        if(!next){job.stage='complete';job.state='complete';job.crewCount=0;job.blockers=[];
          this.resources.release(task('forklift',0,true),job.id,at);this.carrierId=null;continue;}
        job.stage=next;job.durationMs=durations[next];job.remainingWorkMs=job.durationMs;job.state='waiting';
      }
      const state=calendarStateAt(this.calendar,at);
      if(job.lease&&(state.status!=='working'||state.shift!==priorShift)){
        this.resources.release(task(job.stage,job.crewCount),job.id,at);job.lease=false;job.state='paused';
        this.post(job,'handling-paused',`${job.id} · ${job.stage} paused`);
      }
    }
    this.inventory.receiveThrough(at,true);
    for(const receipt of this.plan.receipts){if(receipt.at>at||this.jobs.some(j=>j.id===receipt.id))continue;
      this.jobs.push({id:receipt.id,lotId:receipt.lot.id,sku:receipt.lot.sku,quantity:receipt.lot.quantity,destination:receipt.lot.location,
        arrivalAt:receipt.at,inspectionNotBefore:receipt.inspectionNotBefore??receipt.at,stage:'inspection',state:'waiting',
        remainingWorkMs:durations.inspection,durationMs:durations.inspection,updatedAt:at,dropAt:null,blockers:[],crewCount:0,receipt,lease:false,
        cause:this.inventory.snapshot().history.find(e=>e.receiptId===receipt.id&&e.kind==='material-received')!.id});
    }
  }
  dispatch(at:number,aircraftSegments:readonly string[]=[]){
    if(at!==this.instant)throw new RangeError('Settle handling before dispatch.');
    const working=calendarStateAt(this.calendar,at).status==='working';
    for(const job of this.jobs){
      if(job.stage==='held'||job.stage==='complete'||job.lease)continue;
      const crew=job.stage==='inspection'?2:1,definition=task(job.stage,crew);
      const reasons:string[]=[];
      if(!working)reasons.push('Off shift or scheduled break');
      if(job.stage==='inspection'&&job.inspectionNotBefore>at)reasons.push('Waiting for delayed inspection window');
      if(job.stage==='loading'&&this.carrierId!==job.id){
        if(this.carrierId)reasons.push(`Waiting for kit forklift · ${this.carrierId}`);
        if(aircraftSegments.some(s=>handlingSegments.includes(s as typeof handlingSegments[number])))reasons.push('Waiting for aircraft transfer corridor');
        reasons.push(...this.resources.blockers(task('forklift',0,true),at));
      }
      if(working)reasons.push(...this.resources.blockers(definition,at));
      job.blockers=reasons;job.crewCount=0;
      if(reasons.length){job.state=working?'waiting':'paused';continue;}
      if(job.stage==='loading'&&!this.carrierId){this.resources.acquire(task('forklift',0,true),job.id,at);this.carrierId=job.id;}
      this.resources.acquire(definition,job.id,at);job.lease=true;job.state='working';job.crewCount=crew;
      this.post(job,'handling-started',`${job.id} · ${job.stage} working`);
    }
  }
  nextInstant(at:number){
    const values:number[]=[];
    const pending=this.plan.receipts.find(r=>r.at>at);if(pending)values.push(pending.at);
    if(this.jobs.some(j=>!['held','complete'].includes(j.stage))){
      const boundary=nextBoundary(this.calendar,at);if(boundary)values.push(boundary.instant);
      for(const job of this.jobs){
        if(job.stage==='inspection'&&job.inspectionNotBefore>at)values.push(job.inspectionNotBefore);
        if(job.state==='working'&&workingTimeBetween(this.calendar,at,this.calendar.end)>=job.remainingWorkMs)
          values.push(addWorkingTime(this.calendar,at,job.remainingWorkMs));
      }
    }
    return values.length?Math.min(...values):null;
  }
  snapshot(at:number):HandlingSnapshot{return {jobs:this.jobs.map(({receipt:_r,lease:_l,cause:_c,...job})=>({...job,blockers:[...job.blockers]})),
    carrierId:this.carrierId,segments:this.carrierId?[...handlingSegments]:[],nextEventInstant:this.nextInstant(at)};}
}

/** Same productive interval as the stock event. Callers clamp to the next fleet
 * event, so a rendered pose cannot advance through a break or drop early. */
export function handlingPose(job:HandlingJob,renderInstant=job.updatedAt){
  const elapsed=Math.min(job.durationMs,job.durationMs-job.remainingWorkMs+(job.state==='working'?Math.max(0,renderInstant-job.updatedAt):0));
  const p=job.durationMs?elapsed/job.durationMs:0;
  const returning=job.stage==='returning',points=returning?[...handlingRoute].reverse():handlingRoute;
  let distance=(job.stage==='transit'||returning?p:job.stage==='unloading'?1:0)*handlingLengthM;
  let position:readonly [number,number]=points[0],heading=Math.PI;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),fraction=Math.min(1,distance/length);
    position=[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction];heading=Math.atan2(-(b[1]-a[1]),b[0]-a[0]);
    distance-=length;if(distance<=0)break;
  }
  return {positionM:[position[0],0.7,position[1]] as [number,number,number],heading,
    carrying:['loading','transit','unloading'].includes(job.stage),progress:p};
}
