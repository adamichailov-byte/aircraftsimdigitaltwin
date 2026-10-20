import type { PilotDefinition, PilotSnapshot } from '../simulation/tasks.ts';
import { stationPoses, transfers, transferPose } from '../simulation/transfers.ts';

/** The only physical projection of engine state, shared by actor, camera and UI.
 * A transfer holds its source identity until arrival; the single-aircraft pilot
 * assumes every destination is free. AS-05 owns finite occupancy/reservations. */
export function simulationPose(definition: PilotDefinition, snapshot: PilotSnapshot, renderInstant=snapshot.instant) {
  const milestones=new Set(snapshot.aircraft.completedMilestones);
  const active=snapshot.tasks.filter(task=>task.startedAt!==null && task.state!=='complete');
  const latest=snapshot.tasks.filter(task=>task.completedAt!==null).sort((a,b)=>b.completedAt!-a.completedAt!)[0];
  const operation=active[0] ?? latest ?? snapshot.tasks[0];
  const recipe=definition.tasks.find(task=>task.id===operation?.taskId);
  const stationId=recipe?.stationId ?? 'bay-1';
  const base=stationPoses[stationId] ?? stationPoses['bay-1'];
  const retired=milestones.has('delivered');
  const offsite=recipe?.kind==='offsite' && operation.state!=='complete';
  const transfer=recipe?.transferRouteId ? transfers[recipe.transferRouteId] : undefined;
  // Never render past an unprocessed operational event, even when the tab stalls.
  const instant=Math.max(snapshot.instant,Math.min(renderInstant,snapshot.nextEventInstant ?? snapshot.instant));
  const moving=transfer && operation.startedAt!==null && operation.state!=='complete';
  const motion=moving ? transferPose(transfer,instant-operation.startedAt!) : null;
  const location=transfer && operation.state==='complete' ? stationPoses[transfer.toStation] : base;
  const painted=milestones.has('paint-cured');
  const components={wings:milestones.has('wings-installed'),tail:milestones.has('tail-installed'),
    gear:milestones.has('gear-installed'),engines:milestones.has('engines-installed')};
  const variant=painted ? 'complete' : milestones.has('cabin-installed') ? 'cabin'
    : milestones.has('systems-installed') ? 'systems' : milestones.has('fuselage-joined') ? 'joined-fuselage' : 'sectioned';
  return {id:snapshot.aircraft.id,stationId:location===base?stationId:transfer!.toStation,
    zoneId:retired?'delivery':offsite?'flight-test':moving?transfer.fromStation:location===base?stationId:transfer!.toStation,
    label:offsite?'Offsite acceptance flight':retired?'Delivered':moving?`${stationPoses[transfer.fromStation].label} → ${stationPoses[transfer.toStation].label}`:location.label,
    positionM:motion?.positionM ?? [location.position[0],0.7,location.position[1]] as [number,number,number],
    heading:motion?.heading ?? location.heading,visible:!offsite&&!retired,painted,components,variant,
    state:retired?'delivered':offsite?'offsite-test':moving?'in-transfer':'at-station',
    phase:motion?.phase ?? null,reverse:motion?.reverse ?? false,returnSlot:offsite?'flightline':null,
    sourceStation:moving?transfer.fromStation:null,destinationStation:moving?transfer.toStation:null,
  } as const;
}
