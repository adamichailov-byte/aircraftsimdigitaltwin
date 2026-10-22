import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import type { FleetClient } from '../simulation/client';
import { workingTimeBetween } from '../simulation/calendar';
import { stationActionAt, stationActionDefinitions } from '../demo/station-actions';
import { Block } from './Building';
import {equipmentProgress} from '../simulation/station-presentation';

const steel = '#71858b';
const darkSteel = '#40545b';
const safety = '#c2a657';
const robotOrange = '#d27637';

function taskProgress(client:FleetClient,stationId:string,equipment:string,taskPrefix?:string){
  const view=client.getSnapshot(),fleet=view.displayFleet;if(!fleet)return null;
  const renderInstant=view.history.cursor===null?Math.max(fleet.instant,Math.min(client.clock.getInstant(),fleet.nextEventInstant??fleet.instant)):fleet.instant;
  const elapsed=workingTimeBetween(client.config.recipe.calendar,fleet.instant,renderInstant);
  return equipmentProgress(fleet,stationId,equipment,elapsed,taskPrefix);
}

function WingCraneMotion({ client }: { client:FleetClient }) {
  const definition = stationActionDefinitions[0];
  const trolley = useRef<Group>(null);
  const cable = useRef<Mesh>(null);
  const yoke = useRef<Group>(null);
  useFrame(() => {
    const progress=taskProgress(client,'bay-2','wing-crane');if(!trolley.current||!cable.current||!yoke.current)return;
    const pose=progress?stationActionAt(definition.id,progress.progress*18):stationActionAt(definition.id,18);
    if (!pose) return;
    trolley.current.position.x = pose.trolleyXM;
    const dropM = Math.max(0.4, 23.4 - pose.toolYM);
    cable.current.scale.y = dropM;
    cable.current.position.y = -dropM / 2;
    yoke.current.position.y = pose.toolYM - 23.4;
  });

  return <group position={definition.positionM} name="wing-crane-motion">
      <group ref={trolley} position={[0, 23.4, 0]} name="travelling-bridge">
        <Block at={[0, 0, 0]} size={[1.7, 1.35, 102]} color={steel} />
        <Block at={[0, -0.88, 0]} size={[4.8, 0.42, 4.8]} color={safety} />
        <Block at={[0.7, -0.42, 0]} size={[1.1, 0.35, 2.2]} color={darkSteel} />
        <mesh ref={cable} position={[0, -2, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 1, 8]} /><meshStandardMaterial color="#465b62" roughness={0.82} />
        </mesh>
        <group ref={yoke} position={[0, -10, 0]} name="suspended-wing-alignment-yoke">
          <Block at={[0, 0, 0]} size={[1.2, 0.42, 42]} color={steel} />
          {[-18, 18].map(z => <group key={z}>
            <Block at={[0, -0.8, z]} size={[0.16, 1.6, 0.16]} color={safety} />
            <Block at={[0, -1.62, z]} size={[2.8, 0.32, 1.7]} color={darkSteel} />
            <Block at={[0.95, -1.58, z]} size={[0.14, 0.5, 1.4]} color={safety} />
          </group>)}
          {[-24, -12, 0, 12, 24].map(z => <Block key={z} at={[0, -0.26, z]} size={[0.1, 0.75, 0.1]}
            color="#aeb9b8" shadow={false} />)}
        </group>
      </group>
  </group>;
}

function EngineHoistMotion({ client }: { client:FleetClient }) {
  const definition = stationActionDefinitions[1];
  const hoist = useRef<Group>(null);
  const cable = useRef<Mesh>(null);
  const engine = useRef<Group>(null);
  useFrame(() => {
    const progress=taskProgress(client,'bay-4','lift','engines');if(!hoist.current||!cable.current||!engine.current)return;
    engine.current.visible=progress!==null;
    const pose=progress?stationActionAt(definition.id,20+progress.progress*18):stationActionAt(definition.id,38);
    if (!pose) return;
    hoist.current.position.x = pose.trolleyXM;
    engine.current.position.set(0, pose.toolYM - 11.5, 0);
    engine.current.rotation.z = pose.loadRotation;
    const cableLength = Math.max(0.35, 11.14 - pose.toolYM - 2.06);
    cable.current.scale.y = cableLength;
    cable.current.position.y = -0.36 - cableLength / 2;
  });

  return <group position={definition.positionM} name="engine-hoist-motion">
    <Block at={[-6, 6, 0]} size={[0.55, 12, 0.55]} color={steel} />
    <Block at={[6, 6, 0]} size={[0.55, 12, 0.55]} color={steel} />
    <Block at={[0, 12, 0]} size={[13, 0.65, 0.75]} color={steel} />
    <Block at={[0, 11.56, 0]} size={[10.5, 0.18, 1.5]} color={safety} />
      <group ref={hoist} position={[4, 11.5, 0]} name="engine-hoist-trolley">
        <Block at={[0, 0, 0]} size={[2.8, 0.72, 2.2]} color={darkSteel} />
        <mesh ref={cable} position={[0, -2, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 1, 8]} /><meshStandardMaterial color="#465b62" roughness={0.82} />
        </mesh>
        <group ref={engine} position={[0, -7, 0]} name="suspended-engine">
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[1.55, 1.82, 6.2, 28, 1, true]} />
            <meshStandardMaterial color="#899a9b" roughness={0.7} side={2} />
          </mesh>
          <mesh position={[3.05, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[1.5, 0.13, 10, 32]} /><meshStandardMaterial color="#526970" roughness={0.7} />
          </mesh>
          <mesh position={[3.04, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[1.34, 1.34, 0.12, 28]} /><meshStandardMaterial color="#34474d" roughness={0.8} />
          </mesh>
          <mesh position={[3.12, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.48, 0.1, 8, 20]} /><meshStandardMaterial color="#9eacaf" roughness={0.72} />
          </mesh>
          <Block at={[-2.1, 0, 0]} size={[0.18, 1.95, 1.95]} color={darkSteel} />
          <Block at={[0, 1.98, 0]} size={[2.1, 0.16, 0.16]} color={safety} shadow={false} />
        </group>
      </group>
  </group>;
}

function PaintCarriageMotion({ client }: { client:FleetClient }) {
  const definition = stationActionDefinitions[2];
  const carriage = useRef<Group>(null);
  const sprayers = useRef<Group>(null);
  const armRoot = useRef<Group>(null);
  const elbow = useRef<Group>(null);
  const wrist = useRef<Group>(null);
  useFrame(() => {
    const progress=taskProgress(client,'paint','paint-head');if(!carriage.current||!sprayers.current||!armRoot.current||!elbow.current||!wrist.current)return;
    const pose=progress?stationActionAt(definition.id,40+progress.progress*18):stationActionAt(definition.id,58);
    if (!pose) return;
    carriage.current.position.x = pose.trolleyXM;
    carriage.current.position.y = pose.toolYM;
    const sweep = Math.sin(pose.progress * Math.PI * 2);
    armRoot.current.rotation.z = -0.12 + sweep * 0.2;
    elbow.current.rotation.z = 0.58 - sweep * 0.16;
    wrist.current.rotation.z = -0.38 + sweep * 0.08;
    sprayers.current.visible = !!progress?.working && pose.sprayActive;
  });

  return <group position={definition.positionM} name="paint-carriage-motion">
    <Block at={[0, 19.1, -35]} size={[64, 0.42, 0.55]} color={steel} />
    <Block at={[0, 19.1, 35]} size={[64, 0.42, 0.55]} color={steel} />
      <group ref={carriage} position={[-30, 18.2, 0]} name="traversing-paint-carriage">
        <Block at={[0, 0, 0]} size={[1.8, 0.55, 72]} color={steel} />
        {[-1, 1].map(side => <group key={side}>
          <Block at={[0, -2.1, side * 31]} size={[0.45, 3.7, 0.45]} color={darkSteel} />
          <Block at={[0, -4.0, side * 31]} size={[1.1, 0.25, 0.9]} color={safety} />
        </group>)}
        {[-1, 1].flatMap(side => [-24, 24].map(span => <group key={`${side}-${span}`}>
          <Block at={[0, -1.0, side * span]} size={[1.1, 0.8, 1.1]} color="#536a70" />
        </group>))}
        <group ref={armRoot} position={[0, -0.28, 0]} name="articulated-paint-arm">
          <mesh position={[0, 0.15, 0]} castShadow>
            <sphereGeometry args={[0.72, 16, 12]} /><meshStandardMaterial color={darkSteel} roughness={0.72} />
          </mesh>
          <Block at={[0, -1.38, 0]} size={[1.12, 2.9, 1.05]} color={robotOrange} />
          <Block at={[0.58, -1.38, 0]} size={[0.16, 2.45, 1.1]} color={safety} />
          <group ref={elbow} position={[0, -2.82, 0]} name="paint-arm-elbow">
            <mesh position={[0, 0, 0]} castShadow>
              <sphereGeometry args={[0.58, 14, 10]} /><meshStandardMaterial color={robotOrange} roughness={0.72} />
            </mesh>
            <Block at={[0, -1.15, 0]} size={[0.88, 2.35, 0.86]} color="#d98443" />
            <Block at={[-0.47, -1.15, 0]} size={[0.14, 1.9, 0.9]} color={safety} />
            <group ref={wrist} position={[0, -2.25, 0]} name="paint-head-wrist">
              <mesh position={[0, 0, 0]}>
                <sphereGeometry args={[0.4, 12, 10]} /><meshStandardMaterial color={darkSteel} roughness={0.72} />
              </mesh>
              <group position={[0, -0.48, 0]} name="articulated-paint-head">
                <Block at={[0, 0, 0]} size={[1.45, 0.76, 1.1]} color="#536a70" />
                <Block at={[0, 0.12, -0.1]} size={[0.78, 0.24, 0.68]} color={robotOrange} />
                <Block at={[0, -0.16, 0.43]} size={[0.52, 0.22, 0.12]} color={safety} shadow={false} />
                <mesh position={[0, -0.54, 0]} rotation={[Math.PI, 0, 0]}>
                  <cylinderGeometry args={[0.2, 0.09, 0.72, 12]} />
                  <meshStandardMaterial color="#bdc6c3" metalness={0.28} roughness={0.54} />
                </mesh>
                <group ref={sprayers} position={[0, -0.94, 0]}>
                  <mesh rotation={[Math.PI, 0, 0]}>
                    <coneGeometry args={[1.05, 2.7, 16]} />
                    <meshBasicMaterial color="#d4bb78" transparent opacity={0.18} depthWrite={false} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
  </group>;
}

export function StationMotion({ client }: {client:FleetClient}) {
  return <group name="station-work-cycles">
    <WingCraneMotion client={client} />
    <EngineHoistMotion client={client} />
    <PaintCarriageMotion client={client} />
  </group>;
}
