export type EquipmentOutage={readonly id:string;readonly equipmentId:string;readonly start:number;readonly end:number};
export type QualityPlan={readonly seed:number;readonly failureProbabilityByTask:Readonly<Record<string,number>>;readonly maxRepairCycles:number};
export type DisruptionPlan={readonly quality:QualityPlan};

/** Stable draw from the run seed and inspection identity; independent of render and queue order. */
export function inspectionFails(seed:number,serialId:string,taskId:string,attempt:number,probability:number){
  if(probability<=0)return false;
  if(probability>=1)return true;
  let hash=2166136261;
  for(const char of `${seed}|${serialId}|${taskId}|${attempt}`)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  return hash/0x1_0000_0000<probability;
}

export function validateQualityPlan(plan:QualityPlan){
  if(!Number.isSafeInteger(plan.seed)||!Number.isSafeInteger(plan.maxRepairCycles)||plan.maxRepairCycles<0||plan.maxRepairCycles>2)
    throw new RangeError('Quality seed must be an integer and repair cycles must be between zero and two.');
  for(const [taskId,probability] of Object.entries(plan.failureProbabilityByTask))
    if(!taskId||!Number.isFinite(probability)||probability<0||probability>1)throw new RangeError(`Invalid inspection failure probability for ${taskId}.`);
}
