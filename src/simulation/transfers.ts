/** Metres, radians, integer milliseconds. Synthetic towing: 2m/s forward,
 * 1m/s reverse, 1 degree/s pivot, 5 minutes each to connect/disconnect.
 * Turns model a manoeuvring dolly/tug, not steering-gear dynamics. */
type Point = readonly [number, number];
export const pilotWingCraneRows = [-30,51] as const;
/** Park mobile staging clear of the pilot's swept perimeter aisle. The legacy
 * preview keeps its original dressing; these are positions, not hidden assets. */
export function simulationFixture<T extends {id:string;positionM:[number,number,number]}>(fixture:T):T {
  const position=[...fixture.positionM] as [number,number,number];
  if(/^bay-[123]-parts-rack-/.test(fixture.id)) {
    position[2]=-100;
    if(fixture.id==='bay-1-parts-rack-west') position[0]=-166;
    if(fixture.id==='bay-1-parts-rack-east') position[0]=-140;
  }
  if(fixture.id==='join-platform-port') {position[0]=-166;position[2]=-108;}
  if(fixture.id==='join-platform-starboard') {position[0]=-136;position[2]=-108;}
  if(fixture.id==='wing-platform-port') position[2]=-108;
  if(fixture.id==='wing-platform-starboard') {position[0]=-10;position[2]=-108;}
  if(fixture.id==='systems-cart') {position[0]=104;position[2]=-98;}
  if(fixture.id==='cabin-cart'||fixture.id==='test-cart') position[2]=128;
  if(fixture.id.startsWith('bay-4-parts-rack-')||fixture.id==='engine-stand') position[2]=160;
  if(/^bay-[456]-mobile-tool-cart$/.test(fixture.id))position[2]=145;
  return {...fixture,positionM:position};
}
export type TowPhase = { kind: 'connect' | 'turn' | 'move' | 'disconnect'; from: Point; to: Point;
  heading: number; endHeading: number; durationMs: number; speedMps: number; reverse: boolean };
export type Transfer = { id: string; fromStation: string; toStation: string; phases: readonly TowPhase[];
  durationMs: number; endPosition: Point; endHeading: number };
export const stationPoses: Record<string, { position: Point; heading: number; label: string }> = {
  'bay-1': {position:[-184,-145],heading:0,label:'Bay 01'},
  'bay-2': {position:[-40,-145],heading:0,label:'Bay 02'},
  'bay-3': {position:[104,-145],heading:0,label:'Bay 03'},
  'bay-4': {position:[-184,85],heading:0,label:'Bay 04'},
  'bay-5': {position:[-40,85],heading:0,label:'Bay 05'},
  'bay-6': {position:[104,85],heading:0,label:'Bay 06'},
  paint: {position:[104,-30],heading:Math.PI,label:'Paint'},
  flightline: {position:[230,280],heading:-Math.PI/2,label:'Flight-line acceptance'},
  delivery: {position:[420,280],heading:0,label:'Delivery'},
  departed: {position:[520,280],heading:0,label:'Delivered'},
};
export function angleDelta(from: number, to: number) { return Math.atan2(Math.sin(to-from),Math.cos(to-from)); }
export function route(id: string, fromStation: string, toStation: string, points: readonly Point[], reverseSegments = 0): Transfer {
  const phases: TowPhase[]=[];
  let heading=stationPoses[fromStation].heading;
  const hold=(kind: TowPhase['kind'],at:Point,durationMs:number,endHeading=heading) => {
    phases.push({kind,from:at,to:at,heading,endHeading,durationMs,speedMps:0,reverse:false}); heading=endHeading;
  };
  hold('connect',points[0],300000);
  for(let i=1;i<points.length;i++) {
    const from=points[i-1],to=points[i],reverse=i<=reverseSegments;
    const next=reverse ? Math.PI : Math.atan2(-(to[1]-from[1]),to[0]-from[0]);
    const turn=Math.abs(angleDelta(heading,next));
    if(turn>1e-8) hold('turn',from,Math.ceil(turn*180/Math.PI*1000),next);
    const speedMps=reverse?1:2;
    phases.push({kind:'move',from,to,heading,endHeading:heading,
      durationMs:Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/speedMps*1000),speedMps,reverse});
  }
  const end=points[points.length-1],final=stationPoses[toStation].heading;
  const turn=Math.abs(angleDelta(heading,final));
  if(turn>1e-8) hold('turn',end,Math.ceil(turn*180/Math.PI*1000),final);
  hold('disconnect',end,300000);
  return {id,fromStation,toStation,phases,durationMs:phases.reduce((sum,p)=>sum+p.durationMs,0),endPosition:end,endHeading:final};
}
export const transfers: Record<string,Transfer> = Object.fromEntries([
  route('bay-1-to-2','bay-1','bay-2',[[-184,-145],[-40,-145]]),
  route('bay-2-to-3','bay-2','bay-3',[[-40,-145],[104,-145]]),
  // Same perimeter-aisle intent as the accepted story; inset for the complete
  // 60m × 54.4m aircraft swept envelope instead of testing waypoint centres.
  route('bay-3-to-4','bay-3','bay-4',[[104,-145],[130,-145],[130,-205],[-215,-205],[-215,85],[-184,85]]),
  route('bay-4-to-5','bay-4','bay-5',[[-184,85],[-40,85]]),
  route('bay-5-to-6','bay-5','bay-6',[[-40,85],[104,85]]),
  route('bay-6-to-paint','bay-6','paint',[[104,85],[225,85],[230,50],[230,-30],[190,-30],[148,-30],[104,-30]]),
  route('paint-to-flightline','paint','flightline',[[104,-30],[148,-30],[180,-30],[220,-30],[260,70],[260,145],[230,195],[230,280]],3),
  route('flightline-to-delivery','flightline','delivery',[[230,280],[300,280],[365,280],[420,280]]),
  route('delivery-departure','delivery','departed',[[420,280],[470,280],[520,280]]),
].map(value=>[value.id,value]));

export function transferPose(route: Transfer, elapsedMs: number) {
  let time=Math.max(0,elapsedMs);
  for(const phase of route.phases) {
    if(time<phase.durationMs) {
      const t=time/phase.durationMs;
      return {positionM:[phase.from[0]+(phase.to[0]-phase.from[0])*t,0.7,phase.from[1]+(phase.to[1]-phase.from[1])*t] as [number,number,number],
        heading:phase.heading+angleDelta(phase.heading,phase.endHeading)*t,phase:phase.kind,reverse:phase.reverse};
    }
    time-=phase.durationMs;
  }
  return {positionM:[route.endPosition[0],0.7,route.endPosition[1]] as [number,number,number],heading:route.endHeading,phase:'disconnect',reverse:false};
}
