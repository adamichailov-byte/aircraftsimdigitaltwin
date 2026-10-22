import type {TaskDefinition} from './tasks.ts';

export const variabilityVersion='A100-variability-v1';
export type VariabilityPlan={version:typeof variabilityVersion;seed:number;taskTimes:boolean;receiptDelays:boolean};
export type RealizedDraw={key:string;uniform:number;value:number};
export function validateVariability(plan:VariabilityPlan){
  if(plan.version!==variabilityVersion||!Number.isInteger(plan.seed)||plan.seed<0||plan.seed>2147483647||typeof plan.taskTimes!=='boolean'||typeof plan.receiptDelays!=='boolean')throw new RangeError('Unsupported variability version, seed or options.');
}
/** A keyed stream has no mutable cursor: another event cannot consume this draw. */
export function keyedUniform(seed:number,...identity:(string|number)[]){
  let h=2166136261;
  for(const ch of JSON.stringify([variabilityVersion,seed,...identity]))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
  h=Math.imul(h^(h>>>16),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);h=(h^(h>>>16))>>>0;
  return (h+0.5)/4294967296;
}
export const triangularFactor=(u:number)=>u<0.5?0.8+Math.sqrt(u*0.08):1.2-Math.sqrt((1-u)*0.08);
export function sampleTask(plan:VariabilityPlan,serial:string,task:TaskDefinition,attempt=0):RealizedDraw|null{
  if(!plan.taskTimes||task.kind==='transfer')return null;
  const key=JSON.stringify(['task',serial,task.id,attempt]),uniform=keyedUniform(plan.seed,'task',serial,task.id,attempt);
  return {key,uniform,value:Math.max(1,Math.round(task.durationMs*triangularFactor(uniform)))};
}
export function sampleReceipt(plan:VariabilityPlan,id:string):RealizedDraw|null{
  if(!plan.receiptDelays)return null;
  const uniform=keyedUniform(plan.seed,'receipt',id);
  return {key:JSON.stringify(['receipt',id]),uniform,value:Math.floor(uniform*4)};
}
