import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { AIRCRAFT_STORY_DURATION_SECONDS, aircraftStoryIds, storyAt } from '../demo/story';
import { demoClock } from '../demo/clock';
import { aircraftEntities, inspectableEntities } from '../demo/entities';
import { Aircraft } from '../models/Aircraft';
import type { AircraftVariant } from '../models/aircraft-parts';
import { Block } from './Building';
import { Selectable } from './Selectable';

const aircraftById = new Map(aircraftEntities.map(aircraft => [aircraft.id, aircraft]));
const inspectionById = new Map(inspectableEntities.map(entity => [entity.id, entity]));

function TowWheel({ at }: { at: [number, number, number] }) {
  return <mesh position={at} rotation={[Math.PI / 2, 0, 0]} castShadow>
    <torusGeometry args={[0.52, 0.18, 8, 18]} /><meshStandardMaterial color="#34454b" roughness={0.94} />
  </mesh>;
}

function AircraftTransferSupport({ variant, moving }: { variant: AircraftVariant; moving: boolean }) {
  if (!moving) return null;
  const onWheels = ['engine-install', 'cabin', 'ready-for-paint', 'complete', 'paint'].includes(variant);
  if (!onWheels) return <group name="aircraft-section-transport-dollies">
    {[-20, 1, 21].map(x => <group key={x} position={[x, 0, 0]}>
      <Block at={[0, 1.95, 0]} size={[6.2, 0.42, 7.6]} color="#536970" />
      <Block at={[0, 2.19, 0]} size={[4.6, 0.12, 5.8]} color="#b39a59" shadow={false} />
      {[-1, 1].map(side => <TowWheel key={side} at={[0, 0.58, side * 3.45]} />)}
    </group>)}
  </group>;
  return <group name="aircraft-tow-tractor">
    <Block at={[32, 0.72, 0]} size={[4.2, 0.16, 0.18]} color="#526970" />
    <Block at={[36.1, 1.35, 0]} size={[5.5, 1.1, 2.8]} color="#bc9b4e" />
    <Block at={[35.2, 2.13, 0]} size={[2.4, 0.8, 2.5]} color="#61767c" />
    <Block at={[35.2, 2.18, 1.26]} size={[1.8, 0.54, 0.07]} color="#a6c1bd" shadow={false} />
    {[-1, 1].flatMap(side => [-1, 1].map(end => <TowWheel key={`${side}-${end}`}
      at={[36.1 + end * 1.75, 0.62, side * 1.35]} />))}
  </group>;
}

function initialVariants() {
  return Object.fromEntries(aircraftStoryIds.map(id => [id, storyAt(0, id).variant])) as Record<string, AircraftVariant>;
}

export function AircraftStory({ selectedEntityId, onSelect }: {
  selectedEntityId: string | null; onSelect: (id: string) => void;
}) {
  const roots = useRef(new Map<string, Group>());
  const currentVariants = useRef(initialVariants());
  const [variants, setVariants] = useState(currentVariants.current);
  const lastElapsed = useRef(Number.NaN);

  useFrame(() => {
    const elapsed = demoClock.getElapsedSeconds();
    if (elapsed === lastElapsed.current) return;
    lastElapsed.current = elapsed;
    let nextVariants: Record<string, AircraftVariant> | null = null;
    for (const id of aircraftStoryIds) {
      const pose = storyAt(elapsed, id);
      const root = roots.current.get(id);
      if (root) {
        root.position.set(...pose.positionM);
        root.rotation.y = pose.heading;
        root.visible = pose.zoneId !== 'offsite';
      }
      if (currentVariants.current[id] !== pose.variant) {
        nextVariants ??= { ...currentVariants.current };
        nextVariants[id] = pose.variant;
      }
    }
    if (nextVariants) {
      currentVariants.current = nextVariants;
      setVariants(nextVariants);
    }
    if (elapsed >= AIRCRAFT_STORY_DURATION_SECONDS && demoClock.getSnapshot().playing) {
      demoClock.seek(AIRCRAFT_STORY_DURATION_SECONDS);
      demoClock.setPlaying(false);
    }
  });

  return <group name="aircraft-story">
    {aircraftStoryIds.map(id => {
      const aircraft = aircraftById.get(id)!;
      const inspected = inspectionById.get(id)!;
      const selectable = { ...inspected, positionM: [0, 0, 0] as [number, number, number] };
      const pose = storyAt(demoClock.getElapsedSeconds(), id);
      return <group key={id} ref={group => {
        if (group) roots.current.set(id, group);
        else roots.current.delete(id);
      }} position={pose.positionM} rotation={[0, pose.heading, 0]} name={`moving-${id}`}>
        <Selectable entity={selectable} selected={selectedEntityId === id} onSelect={onSelect}>
          <Aircraft {...aircraft} positionM={[0, 0, 0]} rotationY={0} variant={variants[id]} />
          <AircraftTransferSupport variant={variants[id]} moving={pose.inTransit} />
        </Selectable>
      </group>;
    })}
  </group>;
}
