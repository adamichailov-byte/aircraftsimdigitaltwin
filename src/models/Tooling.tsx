import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import { Block } from '../scene/Building';
import { bays } from '../demo/campus';
import { RepeatedBlocks } from './RepeatedBlocks';
import { pilotWingCraneRows } from '../simulation/transfers';

const metal = '#657982';
const lightMetal = '#9eacaf';
const safety = '#c2a657';
const WING_SUPPORT_HEIGHTS = [5.0, 5.8];

function CablePath({ points, color = '#337b82', radius = 0.12 }: {
  points: [number, number, number][]; color?: string; radius?: number;
}) {
  const geometry = useMemo(() => new TubeGeometry(
    new CatmullRomCurve3(points.map(point => new Vector3(...point))), 28, radius, 6, false,
  ), [points, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}>
    <meshStandardMaterial color={color} roughness={0.82} />
  </mesh>;
}

function JoinAlignment() {
  return <group name="fuselage-join-workstations">
    {[-1, 1].map(side => <group key={side} position={[0, 0, side * 44]}>
      <Block at={[-2, 0.92, 0]} size={[34, 0.14, 0.3]} color={safety} shadow={false} />
      {[-15, -10, -5, 0, 5, 10, 15].map(x => <group key={x} position={[x, 1.2, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.34, 0.34, 1.5, 16]} />
          <meshStandardMaterial color={lightMetal} roughness={0.72} /></mesh>
      </group>)}
      <Block at={[-2, 1.8, side * -1]} size={[5, 1.45, 1.8]} color="#798b8e" />
      <Block at={[10, 2.15, side * -1]} size={[1.2, 2.1, 1.8]} color={metal} />
      <Block at={[10, 3.25, side * -1]} size={[4, 0.12, 1.9]} color={safety} />
    </group>)}
    {[-10, 13].map(x => <group key={x} position={[x, 0.8, 0]}>
      {[-37, 37].map(z => <group key={z} position={[0, 0, z]}>
        <Block at={[0, 0.13, 0]} size={[4, 0.26, 2.6]} color={metal} />
        <Block at={[0, 1.05, 0]} size={[0.2, 1.9, 0.2]} color={lightMetal} />
        <Block at={[0, 1.94, 0]} size={[1.6, 0.12, 1.4]} color={safety} />
      </group>)}
    </group>)}
  </group>;
}

function WingCrane({perimeterClearance=false}:{perimeterClearance?:boolean}) {
  const rows=useMemo(()=>perimeterClearance?pilotWingCraneRows:[-51,51],[perimeterClearance]);
  const columns = useMemo(() => [-44, 44].flatMap(x => rows.map(z => ({
    at: [x, 11.5, z] as [number, number, number], size: [1.5, 23, 1.5] as [number, number, number],
  }))), [rows]);
  const feet = useMemo(() => [-44, 44].flatMap(x => rows.map(z => ({
    at: [x, 1.5, z] as [number, number, number], size: [3, 0.6, 3] as [number, number, number],
  }))), [rows]);
  const caps = useMemo(() => [-44, 44].flatMap(x => rows.map(z => ({
    at: [x, 22.7, z] as [number, number, number], size: [3.8, 0.5, 3.8] as [number, number, number],
  }))), [rows]);
  return <group name="supported-wing-lift-gantry">
    <RepeatedBlocks items={columns} color={metal} />
    <RepeatedBlocks items={feet} color="#788b90" />
    <RepeatedBlocks items={caps} color={safety} />
    {rows.map(z => <Block key={z} at={[0, 23.4, z]} size={[90, 1.2, 1.2]} color="#71858b" />)}
    {[-30, 30].map(z => <Block key={z} at={[0, 5.6, z]} size={[18, 0.18, 0.7]} color={safety} shadow={false} />)}
  </group>;
}

function WingJig() {
  const posts = useMemo(() => [-1, 1].flatMap(side => [14, 24].map((span, index) => ({
    at: [-3, WING_SUPPORT_HEIGHTS[index] / 2 - 0.08, side * span] as [number, number, number],
    size: [1.1, WING_SUPPORT_HEIGHTS[index] - 0.16, 1.1] as [number, number, number],
  }))), []);
  const feet = useMemo(() => [-1, 1].flatMap(side => [14, 24].map(span => ({
    at: [-3, 0.25, side * span] as [number, number, number], size: [2.4, 0.5, 2.4] as [number, number, number],
  }))), []);
  return <group name="wing-root-support-jig">
    <RepeatedBlocks items={posts} color="#778990" />
    <RepeatedBlocks items={feet} color="#576c74" />
    {[-1, 1].flatMap(side => [14, 24].map((span, index) => <group key={`${side}-${span}`} position={[-3, 0, side * span]}>
      <Block at={[0, WING_SUPPORT_HEIGHTS[index] - 0.16, 0]} size={[2.8, 0.32, 2.6]} color="#526770" />
      <Block at={[0, WING_SUPPORT_HEIGHTS[index], 0]} size={[2.4, 0.12, 2.2]} color={safety} />
      <Block at={[0.95, WING_SUPPORT_HEIGHTS[index] - 0.58, 0]} size={[0.14, 0.48, 0.18]} color={lightMetal} />
      <Block at={[-0.95, WING_SUPPORT_HEIGHTS[index] - 0.58, 0]} size={[0.14, 0.48, 0.18]} color={lightMetal} />
    </group>))}
    {[-1, 1].map(side => <Block key={side} at={[-3, 0.82, side * 19]} size={[11, 0.1, 0.45]} color={safety} shadow={false} />)}
  </group>;
}

function CableReel({ at, color }: { at: [number, number, number]; color: string }) {
  return <group position={at} name="grounded-wiring-reel">
    <Block at={[0, 0.65, 0]} size={[1.5, 1.3, 1.4]} color={metal} />
    <Block at={[0, 1.38, 0]} size={[1.8, 0.12, 1.6]} color={lightMetal} />
    <mesh position={[0, 2.4, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.78, 0.78, 1.2, 24]} /><meshStandardMaterial color="#384950" roughness={0.88} />
    </mesh>
    <mesh position={[0, 2.4, 0]} rotation={[0, 0, Math.PI / 2]}>
      <torusGeometry args={[0.68, 0.09, 8, 28]} /><meshStandardMaterial color={color} roughness={0.76} />
    </mesh>
    <mesh position={[0, 2.4, 0]} rotation={[0, 0, Math.PI / 2]}>
      <torusGeometry args={[0.34, 0.07, 8, 24]} /><meshStandardMaterial color={color} roughness={0.76} />
    </mesh>
    <Block at={[0, 2.4, 0]} size={[1.35, 0.13, 0.13]} color={lightMetal} />
    <Block at={[0.15, 2.28, 0.82]} size={[0.38, 0.36, 0.06]} color="#dce4e3" />
  </group>;
}

function SystemsStation() {
  const cyanRun: [number, number, number][] = [[-44, 0.92, -43], [-49, 0.92, -49], [42, 0.92, -49], [48, 0.92, -43], [48, 0.92, -18], [41, 0.98, 0], [34, 1.02, 5]];
  const ochreRun: [number, number, number][] = [[-44, 0.96, -21], [-50, 0.96, -29], [42, 0.96, -45], [49, 0.96, -39], [49, 0.96, -5], [41, 1.02, 8], [34, 1.06, 8]];
  const darkRun: [number, number, number][] = [[-44, 0.9, 1], [-50, 0.9, -8], [-50, 0.9, -48], [42, 0.9, -48], [50, 0.9, -40], [50, 0.9, 23], [42, 0.98, 17], [34, 1.02, 11]];
  return <group name="systems-installation-detail">
    <CableReel at={[-44, 0, -43]} color="#317782" />
    <CableReel at={[-44, 0, -21]} color={safety} />
    <CableReel at={[-44, 0, 1]} color="#4c5557" />
    <CablePath points={cyanRun} />
    <CablePath points={ochreRun} color="#a28d4f" radius={0.14} />
    <CablePath points={darkRun} color="#4c5557" radius={0.16} />
    <Block at={[-42, 1.1, 23]} size={[4, 2.2, 6]} color="#74878d" />
    <Block at={[-42, 2.25, 23]} size={[4.8, 0.18, 6.8]} color={lightMetal} />
    {[-43, -41].map(x => <Block key={x} at={[x, 3.5, 20.1]} size={[0.15, 2.3, 0.15]} color={metal} />)}
    <Block at={[-42, 3.5, 20.1]} size={[2, 0.14, 0.14]} color={safety} />
    {[-3, 0, 3].map(x => <Block key={x} at={[x, 0.9, 51]} size={[0.65, 0.1, 5]} color={safety} shadow={false} />)}
    <Block at={[2, 1.05, 45]} size={[8, 0.14, 0.3]} color={safety} shadow={false} />
  </group>;
}

function EngineHandling() {
  return <group name="engine-lift-and-gear-tools">
    <Block at={[35, 0.35, 36]} size={[11, 0.7, 10]} color="#475b63" />
    <Block at={[35, 1.9, 36]} size={[7.8, 0.32, 7.8]} color={lightMetal} />
    {[-1, 1].flatMap(side => [-1, 1].map(end => <group key={`${side}-${end}`} position={[35 + side * 3.2, 0, 36 + end * 3.2]}>
      <Block at={[0, 0.95, 0]} size={[0.45, 1.9, 0.45]} color={metal} />
      <Block at={[0, 2.1, 0]} size={[0.9, 0.22, 0.9]} color={safety} />
    </group>))}
    {[-35, 35].map(x => <group key={x} position={[x, 0, 39]}>
      <Block at={[0, 0.18, 0]} size={[10, 0.36, 7]} color="#7c8d90" />
      <Block at={[0, 0.45, 0]} size={[7, 0.2, 6]} color={safety} />
      {[-1, 1].map(side => <Block key={side} at={[0, 1.35, side * 2.7]} size={[8, 1.6, 0.18]} color={metal} />)}
      <Block at={[0, 2.25, 0]} size={[8.2, 0.18, 5.5]} color={lightMetal} />
    </group>)}
    <Block at={[0, 0.84, 54]} size={[18, 0.12, 0.5]} color={safety} shadow={false} />
  </group>;
}

function TestStation() {
  const lead: [number, number, number][] = [[35, 0.9, 42], [35, 0.9, 50], [25, 0.9, 53], [15, 1, 53]];
  return <group name="ground-check-fixtures">
    <Block at={[36, 1.45, 38]} size={[6.5, 2.9, 5.5]} color="#71848b" />
    <Block at={[36, 3.05, 38]} size={[7.2, 0.2, 6]} color={lightMetal} />
    <Block at={[36, 2.55, 34.9]} size={[2.5, 1.1, 0.14]} color="#40545b" />
    <Block at={[36, 2.58, 34.78]} size={[1.8, 0.74, 0.03]} color="#aac5c2" shadow={false} />
    {[-1, 1].map(side => <Block key={side} at={[36 + side * 1.5, 1.95, 34.82]} size={[0.1, 0.12, 0.04]} color={safety} shadow={false} />)}
    <CablePath points={lead} color="#a28d4f" radius={0.12} />
    <Block at={[36, 0.78, 52]} size={[9, 0.08, 0.5]} color={safety} shadow={false} />
    {[-1, 1].map(side => <Block key={side} at={[36 + side * 5, 0.78, 52]} size={[0.5, 0.08, 3]} color={safety} shadow={false} />)}
  </group>;
}

export function StationTooling({perimeterClearance=false}:{perimeterClearance?:boolean}) {
  return <group name="station-specific-tooling">
    <group position={[bays[0].centerM[0], 0.7, bays[0].centerM[1]]}><JoinAlignment /></group>
    <group position={[bays[1].centerM[0], 0.7, bays[1].centerM[1]]}><WingJig /><WingCrane perimeterClearance={perimeterClearance}/></group>
    <group position={[bays[2].centerM[0], 0.7, bays[2].centerM[1]]}><SystemsStation /></group>
    <group position={[bays[3].centerM[0], 0.7, bays[3].centerM[1]]}><EngineHandling /></group>
    <group position={[bays[5].centerM[0], 0.7, bays[5].centerM[1]]}><TestStation /></group>
  </group>;
}
