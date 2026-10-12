import { useEffect, useMemo } from 'react';
import { Block } from '../scene/Building';
import type { InspectableEntity } from '../demo/entities';
import { fuselageGeometry, wingGeometry } from './aircraft-parts';
import { finishes } from './materials';

function Wheel({ at, radius = 0.85 }: { at: [number, number, number]; radius?: number }) {
  return <mesh position={at} rotation={[Math.PI / 2, 0, 0]} castShadow>
    <cylinderGeometry args={[radius, radius, 0.65, 16]} /><meshStandardMaterial {...finishes.rubber} />
  </mesh>;
}

export function CargoFreighter() {
  const geometry = useMemo(() => wingGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group name="inbound-cargo-freighter" position={[330, 0.7, -335]}>
    <mesh position={[0, 5.6, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
      <cylinderGeometry args={[3.15, 3.6, 44, 32]} /><meshStandardMaterial {...finishes.primer} />
    </mesh>
    {[-21, 21].map(x => <mesh key={x} position={[x, 5.6, 0]} scale={[1.4, 3.15, 3.15]} castShadow>
      <sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial {...finishes.primer} />
    </mesh>)}
    <mesh position={[-1, 0, 0]} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial {...finishes.wing} />
    </mesh>
    <mesh position={[-2, 4.8, 0]} scale={[10, 0.9, 2.8]} castShadow>
      <sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial {...finishes.wing} />
    </mesh>
    <mesh position={[-22, 3.2, 0]} geometry={geometry} scale={[0.25, 0.6, 0.34]} castShadow>
      <meshStandardMaterial {...finishes.primer} />
    </mesh>
    {[-1, 1].map(side => <group key={side} position={[-1, 2.8, side * 12]}>
      <Block at={[-0.6, 2, 0]} size={[3.2, 1.8, 1.1]} color="#86999b" />
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[1.35, 1.55, 8, 20]} />
        <meshStandardMaterial {...finishes.darkMetal} /></mesh>
      <mesh position={[3.9, 0, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[1.25, 0.12, 8, 20]} />
        <meshStandardMaterial {...finishes.metal} /></mesh>
    </group>)}
    {/* Cargo hatch and contrasting frame are on the loader-facing side. */}
    <Block at={[-19, 5.8, 3.35]} size={[11, 4.3, 0.16]} color="#465a61" shadow={false} />
    <Block at={[-19, 8.05, 3.47]} size={[12, 0.2, 0.12]} color="#b39a59" shadow={false} />
    <Block at={[-19, 3.55, 3.47]} size={[12, 0.2, 0.12]} color="#b39a59" shadow={false} />
    <mesh position={[24, 6.2, 0]} scale={[1.5, 1.15, 2.2]}>
      <sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial {...finishes.glass} />
    </mesh>
    {[-1, 1].map(side => <group key={side}>
      <Wheel at={[-9, 0.95, side * 3.1]} radius={0.62} />
      <Wheel at={[20, 0.95, side * 1.2]} radius={0.55} />
      <Block at={[-9, 2.6, side * 3.1]} size={[0.3, 3.1, 0.3]} color="#526770" />
      <Block at={[20, 2.4, side * 1.2]} size={[0.25, 2.8, 0.25]} color="#526770" />
    </group>)}
    <Block at={[-12, 1.2, 0]} size={[17, 0.4, 9]} color="#526770" />
  </group>;
}

function Flatcar({ xM, load }: { xM: number; load: 'fuselage' | 'wing' | 'kits' }) {
  const section = useMemo(() => load === 'fuselage' ? fuselageGeometry(-14, 14) : null, [load]);
  const wing = useMemo(() => load === 'wing' ? wingGeometry() : null, [load]);
  useEffect(() => () => { section?.dispose(); wing?.dispose(); }, [section, wing]);
  return <group position={[xM, 0, 0]}>
    <Block at={[0, 2.1, 0]} size={[55, 1, 8.4]} color="#586b73" />
    <Block at={[0, 2.7, 0]} size={[48, 0.2, 7.8]} color="#9caaab" shadow={false} />
    {[-18, -7, 7, 18].map(x => <group key={x}>
      <Block at={[x, 2.85, -2.6]} size={[1.1, 1.3, 0.45]} color="#c2a657" />
      <Block at={[x, 2.85, 2.6]} size={[1.1, 1.3, 0.45]} color="#c2a657" />
    </group>)}
    {[-19, 19].map(x => <group key={x}>
      <Wheel at={[x, 1.2, -4.2]} radius={0.68} /><Wheel at={[x, 1.2, 4.2]} radius={0.68} />
    </group>)}
    {load === 'fuselage' && <mesh position={[0, -0.1, 0]} geometry={section!} castShadow>
      <meshStandardMaterial {...finishes.primer} />
    </mesh>}
    {load === 'wing' && <mesh position={[0, -0.1, 0]} geometry={wing!} scale={[0.62, 0.8, 0.62]} castShadow>
      <meshStandardMaterial {...finishes.wing} />
    </mesh>}
    {load === 'kits' && [-1, 1].map(tier => <Block key={tier} at={[0, 3.8 + (tier + 1) * 1.2, 0]}
      size={[27, 2.1, 5.7]} color={tier > 0 ? '#8d9996' : '#b7b7a7'} />)}
  </group>;
}

function Locomotive() {
  return <group position={[100, 0, 0]}>
    <Block at={[0, 3.6, 0]} size={[28, 5.2, 8.8]} color="#3f5d65" />
    <Block at={[7, 7.1, 0]} size={[10, 2.2, 7.7]} color="#526d74" />
    <Block at={[7, 7.35, 4]} size={[6, 1.1, 0.12]} color="#a6c1bd" shadow={false} />
    <Block at={[7, 7.35, -4]} size={[6, 1.1, 0.12]} color="#a6c1bd" shadow={false} />
    {[-9, 0, 9].map(x => <group key={x}>
      <Wheel at={[x, 1.25, -4.65]} radius={1.1} /><Wheel at={[x, 1.25, 4.65]} radius={1.1} />
    </group>)}
    <Block at={[14.2, 2.3, 0]} size={[1.4, 1.4, 2.5]} color="#b39a59" />
  </group>;
}

export function RailConsist() {
  return <group name="rail-section-delivery" position={[-365, 0.7, -345]}>
    {[-90, -30, 30].map((xM, index) => <Flatcar key={xM} xM={xM}
      load={index === 0 ? 'fuselage' : index === 1 ? 'wing' : 'kits'} />)}
    <Locomotive />
  </group>;
}

function Truck({ positionM }: { positionM: [number, number, number] }) {
  return <group position={positionM}>
    <Block at={[4, 1.6, 0]} size={[7, 2.8, 4.1]} color="#536a70" />
    <Block at={[5.4, 3.2, 0]} size={[3.8, 1.2, 3.9]} color="#71858a" />
    <Block at={[6.4, 3.35, 2]} size={[1.7, 0.7, 0.12]} color="#a6c1bd" shadow={false} />
    <Block at={[-5, 2.2, 0]} size={[12.5, 3.6, 4.4]} color="#aab4b3" />
    {[-10, -6, -2, 2].map(x => <Block key={x} at={[x, 4.05, 0]} size={[0.25, 0.16, 4.5]} color="#788b8f" />)}
    {[-9, -5, -1, 2.7, 5.5].map(x => <group key={x}>
      <Wheel at={[x, 0.75, -2.25]} radius={0.7} /><Wheel at={[x, 0.75, 2.25]} radius={0.7} />
    </group>)}
  </group>;
}

function Forklift() {
  return <group position={[-412, 0.7, -307]}>
    <Block at={[-0.4, 1.5, 0]} size={[2.6, 2.2, 2.1]} color="#b39a59" />
    <Block at={[0.35, 3.05, 0]} size={[0.2, 4.2, 1.8]} color="#526770" />
    <Block at={[0.35, 4.9, 0]} size={[0.3, 0.15, 2.1]} color="#526770" />
    <Block at={[1.55, 0.4, -0.72]} size={[2.4, 0.16, 0.18]} color="#71848b" />
    <Block at={[1.55, 0.4, 0.72]} size={[2.4, 0.16, 0.18]} color="#71848b" />
    {[-1, 1].map(side => <group key={side}>
      <Wheel at={[-1.15, 0.65, side * 1.08]} radius={0.65} />
      <Wheel at={[0.8, 0.65, side * 1.08]} radius={0.72} />
    </group>)}
  </group>;
}

function TowTractor({ positionM }: { positionM: [number, number, number] }) {
  return <group position={positionM}>
    <Block at={[0, 1.4, 0]} size={[5.2, 1.7, 2.8]} color="#b39a59" />
    <Block at={[-0.8, 2.45, 0]} size={[2.2, 1.1, 2.5]} color="#677d83" />
    <Block at={[-0.8, 2.55, 1.27]} size={[1.4, 0.72, 0.08]} color="#a6c1bd" shadow={false} />
    {[-1, 1].flatMap(side => [-1.6, 1.6].map(x => <Wheel key={`${side}-${x}`} at={[x, 0.65, side * 1.4]} radius={0.65} />))}
    <Block at={[3.2, 0.72, 0]} size={[1.3, 0.18, 0.18]} color="#526770" />
  </group>;
}

function BeltLoader() {
  return <group position={[312, 0.7, -321]}>
    <Block at={[0, 3.65, 0]} size={[3.3, 0.55, 23]} color="#536970" />
    <mesh position={[0, 3.65, 0]} rotation={[0.19, 0, 0]}>
      <boxGeometry args={[3, 0.18, 23]} /><meshStandardMaterial color="#35494e" roughness={0.9} />
    </mesh>
    {[-1, 1].flatMap(side => [-1, 1].map(end => <Block key={`${side}-${end}`}
      at={[side * 1.15, end < 0 ? 3.15 : 1.45, end * 7]} size={[0.18, end < 0 ? 4.9 : 1.5, 0.18]} color="#798a8d" />))}
    <Block at={[0, 0.8, 8]} size={[5.3, 1.3, 3.6]} color="#b39a59" />
    {[-1, 1].map(side => <Wheel key={side} at={[side * 1.8, 0.65, 8]} radius={0.58} />)}
    <Block at={[0, 2.5, 12]} size={[3.5, 2.2, 4]} color="#aebbb9" />
  </group>;
}

function GroundPowerCart({ positionM }: { positionM: [number, number, number] }) {
  return <group position={positionM}>
    <Block at={[0, 1.25, 0]} size={[3.5, 1.35, 2.1]} color="#74868a" />
    <Block at={[-0.2, 2.15, 0]} size={[2.1, 0.55, 1.7]} color="#526970" />
    {[-1, 1].map(side => <Block key={side} at={[0, 1.25, side * 1.07]}
      size={[2.8, 0.55, 0.08]} color="#3d5056" />)}
    {[-1, 1].flatMap(side => [-1, 1].map(end => <Wheel key={`${side}-${end}`}
      at={[end * 1.2, 0.62, side * 0.9]} radius={0.5} />))}
    <Block at={[1.95, 0.8, 0]} size={[1.1, 0.16, 0.16]} color="#b39a59" />
  </group>;
}

export function GroundSupport({ entity }: { entity: InspectableEntity }) {
  if (entity.id === 'rail-forklift') return <Forklift />;
  if (entity.id === 'cargo-belt-loader') return <BeltLoader />;
  if (entity.id === 'road-delivery-truck') return <Truck positionM={entity.positionM} />;
  if (entity.id === 'material-tug') return <TowTractor positionM={entity.positionM} />;
  if (entity.id === 'delivery-tug') return <TowTractor positionM={entity.positionM} />;
  if (entity.id === 'ground-power-cart') return <GroundPowerCart positionM={entity.positionM} />;
  return null;
}
