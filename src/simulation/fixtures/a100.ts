import { compileCalendar, defaultCalendar, localInstant } from '../calendar.ts';
import type { PilotDefinition } from '../tasks.ts';
import type { TaskDefinition } from '../tasks.ts';
import { transfers } from '../transfers.ts';
import type {InventoryPlan} from '../inventory.ts';
import type {ResourcePlan} from '../resources.ts';

const calendar = compileCalendar(defaultCalendar, '2027-01-04', '2027-04-05');
const HOUR = 3_600_000;
/** Synthetic Bay01 recipe v1. Availability is assumed, not inventory/resource allocation. */
export const bay01Pilot: PilotDefinition = {
  calendar, start: localInstant('2027-01-04T06:00', calendar.timeZone),
  end: localInstant('2027-04-04T06:00', calendar.timeZone),
  serialId: 'A100-P001', availability: 'assumed-abundant',
  tasks: [
    { id: 'align', label: 'Align sections', prerequisites: [], durationMs: 8 * HOUR,
      crewRequirements: { structural: 6 }, materialRequirements: { 'major-section-kit': 1 },
      completionMilestones: ['sections-aligned'] },
    { id: 'join', label: 'Join fuselage', prerequisites: ['align'], durationMs: 16 * HOUR,
      crewRequirements: { structural: 8 }, materialRequirements: { 'join-kit': 1 },
      completionMilestones: ['fuselage-joined'] },
    { id: 'inspect', label: 'Inspect join', prerequisites: ['join'], durationMs: 4 * HOUR,
      crewRequirements: { quality: 2 }, materialRequirements: {},
      completionMilestones: ['join-inspected'] },
  ],
};

/** Synthetic daily work packages. Effort and material totals retain the original recipe.
 * Each transfer is an elapsed operation that starts in a staffed period and
 * finishes without interruption. Cure/flight may start at any instant. */
const tasks: TaskDefinition[] = [];
let previous='';
function work(id:string,label:string,stationId:string,hours:number,crewRequirements:Record<string,number>,
  materialRequirements:Record<string,number>={},completionMilestones:string[]=[],equipmentRequirements:Record<string,number>={},
  elapsed=false,prerequisites=previous?[previous]:[]) {
  tasks.push({id,label,stationId,prerequisites,durationMs:hours*HOUR,crewRequirements,materialRequirements,
    completionMilestones,equipmentRequirements,holdEquipmentOffShift:elapsed,durationMode:elapsed?'elapsed':'working',
    startPolicy:elapsed?'anytime':'working',finishWithinDay:!elapsed,kind:id==='flight'?'offsite':'work'});
  previous=id;
}
/** A kit is issued on the first package; installed milestones follow the final closeout. */
function packages(id:string,station:string,steps:readonly [string,string,number][],crew:Record<string,number>,
  materials:Record<string,number>={},milestones:string[]=[],equipment:Record<string,number>={},prerequisites=previous?[previous]:[]){
  steps.forEach(([suffix,label,hours],index)=>work(index===0?id:`${id}-${suffix}`,label,station,hours,crew,
    index===0?materials:{},index===steps.length-1?milestones:[],equipment,false,index===0?prerequisites:[previous]));
}
function tow(id:string) {
  const route=transfers[id];
  tasks.push({id,label:`Tow · ${route.fromStation} → ${route.toStation}`,stationId:route.fromStation,
    prerequisites:[previous],durationMs:route.durationMs,durationMode:'elapsed',kind:'transfer',transferRouteId:id,
    crewRequirements:{logistics:2},equipmentRequirements:{'tow-tug':1},holdEquipmentOffShift:true,materialRequirements:{},
    completionMilestones:id==='delivery-departure'?['delivered']:[]});
  previous=id;
}
packages('align','bay-1',[
  ['datum','Set section datums',3],['mate','Mate fuselage sections',3],['survey','Survey section alignment',2],
],{structural:6},{'major-section-kit':1},['sections-aligned']);
packages('join','bay-1',[
  ['lower','Secure lower fuselage joints',4],['upper','Secure upper fuselage joints',4],
  ['sides','Secure side joints',4],['closeout','Seal and close fuselage joints',4],
],{structural:8},{'join-kit':1},['fuselage-joined']);
work('inspect','Inspect fuselage joints','bay-1',4,{quality:2},{},['join-inspected']);

tow('bay-1-to-2');
packages('wings','bay-2',[
  ['position','Position wing pair',4],['attach','Secure wing attachments',4],['closeout','Torque and verify wing joints',4],
],{structural:8},{'wing-pair-kit':1},['wings-installed'],{'wing-crane':1});
packages('tail','bay-2',[
  ['position','Position tail surfaces',4],['closeout','Secure tail attachments',4],
],{structural:4},{'tail-kit':1},['tail-installed']);
work('inspect-structure','Inspect structure','bay-2',4,{quality:2});
tow('bay-2-to-3');
packages('wiring','bay-3',[
  ['forward','Route forward fuselage harnesses',3],['aft','Route aft fuselage harnesses',3],
  ['left-wing','Connect left wing harnesses',3],['right-wing','Connect right wing harnesses',3],
  ['flight-deck','Terminate flight-deck wiring',3],['cabin','Terminate cabin wiring',3],
  ['bonding','Secure harness clamps and bonding',3],['closeout','Verify wiring installation',3],
],{systems:6},{'electrical-kit':1},['wiring-installed']);
const wiringComplete=previous;
packages('hydraulics','bay-3',[
  ['forward','Fit forward hydraulic lines',3],['aft','Fit aft hydraulic lines',3],
  ['left-wing','Fit left wing hydraulic lines',3],['right-wing','Fit right wing hydraulic lines',3],
  ['connections','Connect hydraulic manifolds',2],['closeout','Leak-check hydraulic circuits',2],
],{systems:4},{'hydraulic-kit':1},['hydraulics-installed'],{},['bay-2-to-3']);
work('systems-power-check','Check system power and continuity','bay-3',3,{systems:4,quality:1},{},[],{},false,[wiringComplete,previous]);
work('systems-functional-check','Check integrated controls','bay-3',3,{systems:4,quality:1});
work('integrated-check','Inspect integrated systems','bay-3',2,{systems:4,quality:1},{},['systems-installed']);
tow('bay-3-to-4');
packages('gear','bay-4',[
  ['position','Position landing-gear assemblies',4],['closeout','Connect and lock landing gear',4],
],{structural:4},{'gear-kit':1},['gear-installed'],{lift:1});
packages('engines','bay-4',[
  ['position','Position engines on pylons',4],['attach','Secure engine mounts',4],['closeout','Connect engine services',4],
],{systems:6},{engine:2},['engines-installed'],{lift:1});
work('interfaces','Verify interfaces','bay-4',4,{quality:2});
tow('bay-4-to-5');
packages('cabin-services','bay-5',[
  ['runs','Install cabin utility runs',4],['air-water','Fit cabin air and water systems',4],['closeout','Verify cabin service connections',4],
],{fitout:6},{'cabin-services-kit':1});
packages('cabin','bay-5',[
  ['sidewalls','Fit cabin sidewalls',4],['overhead','Fit overhead units',4],
  ['seats','Install seat groups',4],['closeout','Verify cabin attachments',4],
],{fitout:8},{'cabin-interior-kit':1},['cabin-installed']);
work('inspect-cabin','Inspect cabin','bay-5',4,{quality:2});
tow('bay-5-to-6');
packages('power-on','bay-6',[
  ['energize','Energize and verify electrical power',4],['closeout','Exercise ground systems',4],
],{systems:4},{},[],{'test-rig':1});
packages('findings','bay-6',[
  ['electrical','Rectify electrical findings',4],['closeout','Rectify mechanical findings',4],
],{systems:4});
work('pre-paint','Pre-paint release','bay-6',4,{quality:2});
tow('bay-6-to-paint');
packages('mask','paint',[
  ['clean','Clean and mask surfaces',3],['closeout','Prepare coating surfaces',3],
],{paint:4},{},[],{booth:1});
work('spray','Spray coating','paint',4,{paint:4},{'coating-kit':1},[],{booth:1,'paint-head':1});
work('cure','Cure coating','paint',8,{},{},['paint-cured'],{booth:1},true);
work('inspect-paint','Inspect finish','paint',2,{quality:2},{},[],{booth:1});
tow('paint-to-flightline');
work('acceptance-functional','Ground functional checks','flightline',4,{systems:4,quality:2});
work('acceptance','Verify ground acceptance','flightline',4,{systems:4,quality:2});
work('flight','Offsite acceptance flight','flightline',4,{},{},['flight-accepted'],{'flight-slot':1},true);
work('post-flight','Post-flight clearance','flightline',4,{quality:2});
tow('flightline-to-delivery');
work('customer-cabin','Customer cabin inspection','delivery',4,{quality:2});
work('customer','Customer exterior inspection','delivery',4,{quality:2});
work('documents','Delivery documents','delivery',4,{quality:1});
work('handover','Customer handover','delivery',2,{quality:1});
tow('delivery-departure');
const repairTrade:Readonly<Record<string,string>>={inspect:'structural','inspect-structure':'structural','integrated-check':'systems',
  interfaces:'systems','inspect-cabin':'fitout','pre-paint':'systems','inspect-paint':'paint',acceptance:'systems',
  'post-flight':'systems',customer:'fitout'};
export const a100Pilot: PilotDefinition = {...bay01Pilot,tasks:tasks.map(task=>repairTrade[task.id]
  ?{...task,qualityCheck:{repairCrewRequirements:{[repairTrade[task.id]]:2}}}:task)};

export const materialCatalog:Readonly<Record<string,{label:string;location:string}>>={
  'major-section-kit':{label:'Major-section kit',location:'Incoming section stands'},
  'join-kit':{label:'Join kit',location:'Bay01 kit rack'},
  'wing-pair-kit':{label:'Wing-pair kit',location:'Bay02 wing stands'},
  'tail-kit':{label:'Tail kit',location:'Bay02 kit rack'},
  'electrical-kit':{label:'Electrical kit',location:'Bay03 kit rack'},
  'hydraulic-kit':{label:'Hydraulic kit',location:'Bay03 kit rack'},
  'gear-kit':{label:'Landing-gear kit',location:'Bay04 gear stand'},
  engine:{label:'Engine',location:'Bay04 engine rack'},
  'cabin-services-kit':{label:'Cabin-services kit',location:'Bay05 kit rack'},
  'cabin-interior-kit':{label:'Cabin-interior kit',location:'Bay05 kit rack'},
  'coating-kit':{label:'Coating kit',location:'Paint stores'},
};

/** Synthetic staffing and shared equipment capacity, repeated per named shift. */
export const a100Resources:ResourcePlan={
  crewsByShift:{'Shift 1':{structural:24,systems:24,fitout:16,quality:8,paint:4,logistics:4},
    'Shift 2':{structural:24,systems:24,fitout:16,quality:8,paint:4,logistics:4}},
  equipment:{'wing-crane':1,lift:1,'test-rig':1,'paint-head':1,booth:1,'flight-slot':1,'tow-tug':2,'kit-forklift':1},
};
/** Synthetic stock policy v1: four aircraft sets initially; four more every
 * eight working dates. Receipts require inspection, kitting and a central-store drop. */
export function a100Materials(workingDates:readonly number[],count:number,lateEngines=false):InventoryPlan{
  const lateAt=localInstant('2027-01-25T06:00',calendar.timeZone);
  const initial=Object.entries(materialCatalog).map(([sku,meta])=>({id:`opening-${sku}`,sku,location:meta.location,
    quantity:sku==='engine'?(lateEngines?2:8):4,quarantined:sku==='engine'&&lateEngines?1:0}));
  const receipts:InventoryPlan['receipts'][number][]=[];
  for(let supplied=4;supplied<count;supplied+=4){
    for(const sku of Object.keys(materialCatalog))receipts.push({id:`receipt-${supplied}-${sku}`,
      at:sku==='engine'&&lateEngines?Math.max(lateAt,workingDates[supplied*2]):workingDates[supplied*2],
      lot:{id:`batch-${supplied}-${sku}`,sku,location:'Central stores',quantity:4*(sku==='engine'?2:1),quarantined:0}});
  }
  if(lateEngines)receipts.push({id:'engine-recovery',at:lateAt,
    lot:{id:'engine-recovery',sku:'engine',location:'Central stores',quantity:7,quarantined:0}});
  return {initial,receipts};
}
