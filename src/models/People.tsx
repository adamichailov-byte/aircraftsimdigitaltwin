import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { demoClock } from '../demo/clock';
import { personPoseAt, personRoutes } from '../demo/routes';
import type { InspectableEntity } from '../demo/entities';
import { Selectable } from '../scene/Selectable';
import { Block } from '../scene/Building';
import { technicianGround } from './people-ground';
import { stationWorkActiveForZone } from '../demo/station-actions';
import { storyMachineTimeAt } from '../demo/story';

export function DemoClockDriver() {
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    const unsubscribe = demoClock.subscribe(invalidate);
    return () => { unsubscribe(); };
  }, [invalidate]);
  useFrame((_, delta) => {
    if (document.visibilityState !== 'hidden') demoClock.advance(delta);
  });
  return null;
}

function WalkingFigure({ legs, arms }: { legs: React.RefObject<Group | null>[]; arms: React.RefObject<Group | null>[] }) {
  return <group>
    <Block at={[0, 1.03, 0]} size={[0.44, 0.62, 0.25]} color="#b39a59" />
    <mesh position={[0, 1.53, 0]} castShadow>
      <sphereGeometry args={[0.17, 12, 10]} /><meshStandardMaterial color="#b99e88" roughness={0.9} />
    </mesh>
    <mesh position={[0, 1.64, 0]} castShadow>
      <sphereGeometry args={[0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#e1dfc9" roughness={0.8} />
    </mesh>
    {legs.map((leg, index) => <group key={`leg-${index}`} ref={leg}
      position={[(index ? 1 : -1) * 0.12, technicianGround.legPivotY, 0]}>
      <Block at={[0, -technicianGround.lowerLegHeight / 2, 0]}
        size={[0.15, technicianGround.lowerLegHeight, 0.17]} color="#526770" />
      <Block at={[0, -technicianGround.footCenterBelowLegPivot, 0.08]}
        size={[0.2, technicianGround.footHeight, 0.32]} color="#3d484d" />
    </group>)}
    {arms.map((arm, index) => <group key={`arm-${index}`} ref={arm} position={[(index ? 1 : -1) * 0.27, 1.23, 0]}>
      <Block at={[0, -0.27, 0]} size={[0.13, 0.48, 0.15]} color="#70838a" />
    </group>)}
  </group>;
}

function MovingPerson({ entity, selected, onSelect }: {
  entity: InspectableEntity; selected: boolean; onSelect: (id: string) => void;
}) {
  const route = personRoutes.find(candidate => candidate.entityId === entity.id);
  const actor = useRef<Group>(null);
  const legs = [useRef<Group>(null), useRef<Group>(null)];
  const arms = [useRef<Group>(null), useRef<Group>(null)];
  useFrame(() => {
    if (!route || !actor.current) return;
    const elapsedSeconds = demoClock.getElapsedSeconds();
    const holdAtSafetyPoint = Boolean(route.stationWorkZoneId
      && stationWorkActiveForZone(route.stationWorkZoneId, storyMachineTimeAt(elapsedSeconds)));
    const pose = personPoseAt(route, elapsedSeconds, holdAtSafetyPoint);
    // Building pads top out at y=0.7 m; align each figure's feet to that slab.
    actor.current.position.set(pose.xM, technicianGround.rootY, pose.zM);
    actor.current.rotation.y = pose.heading;
    legs[0].current!.rotation.x = pose.working ? 0 : pose.gait * 0.48;
    legs[1].current!.rotation.x = pose.working ? 0 : -pose.gait * 0.48;
    arms[0].current!.rotation.x = pose.working ? -0.15 : -pose.gait * 0.3;
    arms[0].current!.rotation.z = pose.working ? 0.65 : 0;
    arms[1].current!.rotation.x = pose.working ? -0.15 : pose.gait * 0.3;
    arms[1].current!.rotation.z = pose.working ? -0.65 : 0;
  });
  const localEntity = { ...entity, positionM: [0, 0, 0] as [number, number, number] };
  return <group ref={actor} name={`moving-${entity.id}`}>
    <Selectable entity={localEntity} selected={selected} onSelect={onSelect}>
      <WalkingFigure legs={legs} arms={arms} />
    </Selectable>
  </group>;
}

export function MovingPeople({ people, selectedEntityId, onSelect }: {
  people: InspectableEntity[]; selectedEntityId: string | null; onSelect: (id: string) => void;
}) {
  return <group name="technician-routes">
    {people.map(person => <MovingPerson key={person.id} entity={person}
      selected={selectedEntityId === person.id} onSelect={onSelect} />)}
  </group>;
}
