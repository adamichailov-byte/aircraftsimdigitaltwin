import { Block } from '../scene/Building';
import type { FixtureEntity } from '../demo/entities';
import { fuselageGeometry, wingGeometry } from './aircraft-parts';
import { finishes, scenePalette } from './materials';
import { useEffect, useMemo } from 'react';
import { RepeatedBlocks } from './RepeatedBlocks';

function WorkPlatform({ size }: { size: [number, number, number] }) {
  const [length, height, width] = size;
  const x = length / 2 - 0.45;
  const z = width / 2 - 0.35;
  const stairs = useMemo(() => Array.from({ length: 6 }, (_, index) => ({
    at: [length / 2 + 1 + index * 0.76, 0.44 + index * (height - 0.72) / 5, width / 2 + 1.2] as [number, number, number],
    size: [0.78, 0.16, 2.8] as [number, number, number],
  })), [height, length, width]);
  const stairPosts = useMemo(() => [0, 5].flatMap(index => [-1, 1].map(side => ({
    at: [length / 2 + 1 + index * 3.8, 0.72 + index * (height - 0.72), width / 2 + 1.2 + side * 1.15] as [number, number, number],
    size: [0.12, 1.25, 0.12] as [number, number, number],
  }))), [height, length, width]);
  const railPosts = useMemo(() => [-1, 1].flatMap(side => Array.from({ length: 7 }, (_, index) => ({
    at: [-length / 2 + 0.6 + index * (length - 1.2) / 6, height + 0.25, side * z] as [number, number, number],
    size: [0.1, 0.55, 0.12] as [number, number, number],
  }))), [height, length, z]);
  const railLength = Math.hypot(3.8, height - 1.44);
  const railAngle = -Math.atan2(3.8, height - 1.44);
  return <group name="access-platform">
    <Block at={[0, height - 0.14, 0]} size={[length, 0.28, width]} color={scenePalette.platformDeck} />
    {[-1, 1].flatMap(a => [-1, 1].map(b => <Block key={`${a}-${b}`} at={[a * x, height / 2, b * z]}
      size={[0.22, height, 0.22]} color={scenePalette.tooling} />))}
    {[-1, 1].map(side => <Block key={side} at={[0, height + 0.55, side * z]}
      size={[length, 0.12, 0.12]} color={scenePalette.equipment} />)}
    <RepeatedBlocks items={railPosts} color={scenePalette.tooling} />
    <RepeatedBlocks items={stairs} color={scenePalette.steel} />
    <RepeatedBlocks items={stairPosts} color={scenePalette.tooling} />
    {[-1, 1].map(side => <mesh key={side}
      position={[length / 2 + 2.9, height / 2 + 0.42, width / 2 + 1.2 + side * 1.15]} rotation={[0, 0, railAngle]}>
      <cylinderGeometry args={[0.08, 0.08, railLength, 10]} /><meshStandardMaterial color={scenePalette.equipment} roughness={0.7} />
    </mesh>)}
    <Block at={[0, height - 0.02, 0]} size={[length - 0.4, 0.05, width - 0.4]} color="#9eacaf" shadow={false} />
  </group>;
}

function Cart({ size }: { size: [number, number, number] }) {
  const [length, height, width] = size;
  return <group name="mobile-service-cart">
    {[-1, 1].flatMap(x => [-1, 1].map(z => <mesh key={`${x}-${z}`} position={[x * (length / 2 - 0.28), 0.27, z * (width / 2 - 0.25)]}>
      <cylinderGeometry args={[0.28, 0.28, 0.18, 16]} /><meshStandardMaterial color={scenePalette.rubber} roughness={0.9} />
    </mesh>))}
    <Block at={[0, 0.62, 0]} size={[length, 0.18, width]} color={scenePalette.platformDeck} />
    <Block at={[0, Math.min(height, 1.22), 0]} size={[length * 0.62, 0.84, width * 0.66]} color={scenePalette.tooling} />
    <Block at={[0, Math.min(height, 1.68), -width * 0.45]} size={[length, 0.07, 0.08]} color={scenePalette.equipment} />
    <Block at={[length / 2 - 0.12, 0.92, 0]} size={[0.12, 0.7, 0.12]} color={scenePalette.tooling} />
    <Block at={[length * 0.12, 0.92, width * 0.41]} size={[length * 0.34, 0.52, 0.08]} color={scenePalette.steel} />
    <Block at={[length * 0.12, 0.94, width * 0.36]} size={[length * 0.26, 0.34, 0.035]} color="#a6c1bd" shadow={false} />
    {[-0.3, 0, 0.3].map(offset => <Block key={offset} at={[length * 0.12 + length * offset, 0.94, width * 0.34]}
      size={[0.035, 0.3, 0.035]} color="#c5a958" shadow={false} />)}
    <mesh position={[-length * 0.28, 0.95, width * 0.43]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.48, 0.07, 8, 20]} /><meshStandardMaterial color={scenePalette.tooling} roughness={0.85} />
    </mesh>
  </group>;
}

function Pallet({ size, id, load }: { size: [number, number, number]; id: string; load?: FixtureEntity['load'] }) {
  const [length, height, width] = size;
  const crateHeight = (height - 0.48) / 2;
  const section = useMemo(() => load === 'fuselage' ? fuselageGeometry(-7, 7) : null, [load]);
  const wing = useMemo(() => load === 'wing' ? wingGeometry() : null, [load]);
  useEffect(() => () => { section?.dispose(); wing?.dispose(); }, [section, wing]);
  return <group name={id}>
    <Block at={[0, 0.16, 0]} size={[length, 0.32, width]} color="#9d8768" shadow={false} />
    <Block at={[0, 0.35, 0]} size={[length - 0.9, 0.12, width - 0.9]} color="#b4a184" shadow={false} />
    {load === 'fuselage' && <>
      <mesh position={[0, -0.1, 0]} geometry={section!} castShadow><meshStandardMaterial {...finishes.primer} /></mesh>
      {[-5, 5].map(x => <Block key={x} at={[x, 1.65, 0]} size={[0.7, 2.7, 8]} color={scenePalette.platformDeck} />)}
    </>}
    {load === 'wing' && <mesh position={[0, -3.8, -13.5]} geometry={wing!} castShadow>
      <meshStandardMaterial {...finishes.wing} />
    </mesh>}
    {load !== 'fuselage' && load !== 'wing' && [-1, 1].map(tier => <group key={tier}>
      <Block at={[0, tier < 0 ? 0.36 + crateHeight / 2 : 0.36 + crateHeight * 1.5, 0]}
        size={[length * 0.74, crateHeight * 0.9, width * 0.73]}
        color={tier === 1 ? '#87999b' : '#b0bab7'} />
      {[-1, 1].map(side => <Block key={side}
        at={[side * length * 0.39, tier < 0 ? 0.36 + crateHeight / 2 : 0.36 + crateHeight * 1.5, 0]}
        size={[0.18, crateHeight * 0.9, width * 0.82]} color={scenePalette.equipment} shadow={false} />)}
    </group>)}
  </group>;
}

function Rack({ size, fullness=1 }: { size: [number, number, number]; fullness?:number }) {
  const [length, height, width] = size;
  return <group name="inventory-rack">
    {[-1, 1].flatMap(z => [-1, 1].map(x => <Block key={`${x}-${z}`}
      at={[x * (length / 2 - 0.4), height / 2, z * width / 2]}
      size={[0.28, height, 0.28]} color={scenePalette.tooling} />))}
    {[-1, 0, 1].map(level => <group key={level}>
      <Block at={[0, 0.48 + (level + 1) * (height - 0.9) / 2, 0]}
        size={[length, 0.2, width]} color={scenePalette.platformDeck} />
      {[-1, 1, 3].filter((_,i)=>(level+1)*3+i<Math.ceil(9*Math.max(0,Math.min(1,fullness)))).map(index => <Block key={index}
        at={[-length * 0.34 + index * length * 0.17, 1.12 + (level + 1) * (height - 0.9) / 2, 0]}
        size={[length * 0.13, 0.82, width * 0.72]} color="#aebbb9" />)}
    </group>)}
  </group>;
}

export function StationFixture({ fixture,fullness }: { fixture: FixtureEntity;fullness?:number }) {
  return <group name={fixture.id} position={[fixture.positionM[0], 0.7, fixture.positionM[2]]}>
    {fixture.kind === 'platform' && <WorkPlatform size={fixture.sizeM} />}
    {fixture.kind === 'cart' && <Cart size={fixture.sizeM} />}
    {fixture.kind === 'pallet' && <Pallet size={fixture.sizeM} id={fixture.id} load={fixture.load} />}
    {fixture.kind === 'rack' && <Rack size={fixture.sizeM} fullness={fullness} />}
  </group>;
}

export function PaintEnclosure({ roofs, doorsOpen=false }: { roofs: boolean; doorsOpen?: boolean }) {
  const length = 88;
  const width = 80;
  const height = 22;
  const wallHeight = roofs ? height : 4;
  return <group name="paint-enclosure" position={[104, 0.7, -30]}>
    <Block at={[0, 0.03, 0]} size={[length, 0.06, width]} color={scenePalette.paintFloor} shadow={false} />
    {[-1, 1].map(side => <Block key={side} at={[0, wallHeight / 2, side * (width / 2 - 0.6)]}
      size={[length, wallHeight, 1.2]} color={scenePalette.cladding} />)}
    {[-1, 1].map(end => <group key={end} position={[end * (length / 2 - 0.6), 0, 0]}>
      {[-1, 1].map(side => <Block key={side} at={[0, wallHeight / 2, side * 37]}
        size={[1.2, wallHeight, 6]} color={scenePalette.cladding} />)}
      {(!doorsOpen || roofs) && <Block at={[0, (doorsOpen ? height : wallHeight) - 0.9, 0]} size={[1.3, 1.8, 68]} color={scenePalette.cladding} />}
      {(!doorsOpen || roofs) && <Block at={[0, doorsOpen ? height - 2 : 1.2, 0]} size={[1.45, 2.4, 68]} color="#6f858c" />}
    </group>)}
    <Block at={[45, wallHeight / 2, -29]} size={[6, wallHeight, 6]} color="#788c91" />
    {roofs && [0, 1, 2].map(i => <Block key={i} at={[45, 8 + i * 2.5, -32.1]}
      size={[4.4, 0.18, 0.12]} color="#c2cccd" shadow={false} />)}
    {roofs && <Block at={[-37, 20.3, 0]} size={[8, 2.2, 66]} color="#94a6aa" />}
    {roofs && [-1, 1].map(side => <group key={side} position={[side * 38, 0, 0]}>
      <Block at={[0, 13, 0]} size={[4.6, 4.6, 62]} color="#82969a" />
      {[-1, 1].map(end => <Block key={end} at={[0, 13, end * 28]} size={[5.2, 5.2, 0.35]} color="#c1cdcc" shadow={false} />)}
      <Block at={[side * -1.4, 8.5, 0]} size={[0.18, 4.2, 58]} color={scenePalette.equipment} shadow={false} />
    </group>)}
    {[-1, 1].map(side => <Block key={side} at={[0, 2.2, side * 34]} size={[78, 0.16, 0.35]} color={scenePalette.equipment} shadow={false} />)}
    <Block at={[0, 0.8, 0]} size={[length - 12, 0.05, width - 12]} color={scenePalette.paintFloor} shadow={false} />
    {roofs && <Block at={[0, height + 0.6, 0]} size={[length, 1.2, width]} color={scenePalette.cladding} />}
  </group>;
}
