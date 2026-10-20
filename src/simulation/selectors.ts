import type {FleetAircraft,FleetConfig,FleetSnapshot} from './flow.ts';
import {fleetRoutes} from './flow.ts';
import {stationPoses,transferPose} from './transfers.ts';
import {simulationPose} from '../scene/simulation-pose.ts';

/** Actor, camera, station list and inspector consume this same physical view. */
export function fleetPose(config:FleetConfig,snapshot:FleetSnapshot,a:FleetAircraft,renderInstant=snapshot.instant){
  const built=simulationPose({...config.recipe,serialId:a.id,tasks:a.tasks},a.pilot);
  const transfer=snapshot.transfers.find(t=>t.serialId===a.id);
  const instant=Math.max(snapshot.instant,Math.min(renderInstant,snapshot.nextEventInstant??snapshot.instant));
  const motion=transfer?transferPose(fleetRoutes[transfer.routeId],instant-transfer.start):null;
  const location=stationPoses[a.slot];
  return {...built,positionM:motion?.positionM??[location.position[0],0.7,location.position[1]] as [number,number,number],
    heading:motion?.heading??location.heading,visible:a.state!=='offsite'&&a.state!=='delivered',
    zoneId:a.state==='offsite'?'flight-test':a.slot.startsWith('queue-')?'receiving':a.slot==='departed'||a.slot==='delivery-2'?'delivery':a.slot,
    label:transfer?`${stationPoses[transfer.fromSlot].label} → ${stationPoses[transfer.toSlot].label}`
      :a.state==='offsite'?'Offsite acceptance flight':location.label,
    phase:motion?.phase??null,reverse:motion?.reverse??false,state:a.state,reasons:a.reasons,
  };
}
