import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { DependencyList } from 'react';
import { useThree } from '@react-three/fiber';
import { Block } from '../scene/Building';
import { BufferGeometry, Euler, Float32BufferAttribute, InstancedMesh, Matrix4, Quaternion,
  Shape, ShapeGeometry, TorusGeometry, CylinderGeometry, Vector3 } from 'three';
import type { MeshStandardMaterialParameters } from 'three';
import { bodyAt, bodyPatch, cockpitWindshieldGeometry, doorPositionsM, fanBladeGeometry, fuselageGeometry,
  nacelleGeometry, polygonPrism, stabilizerGeometry, tailFinGeometry, wingGeometry } from './aircraft-parts';
import type { AircraftVariant, Cutaway } from './aircraft-parts';
import { finishes } from './materials';

type Pose = { at: [number, number, number]; rotation?: [number, number, number]; scale?: number };

function useGeometry(factory: () => BufferGeometry, dependencies: DependencyList) {
  const shape = useMemo(factory, dependencies);
  useEffect(() => () => shape.dispose(), [shape]);
  return shape;
}

function Instances({ shape, poses, finish }: {
  shape: BufferGeometry; poses: Pose[]; finish: MeshStandardMaterialParameters;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const matrix = new Matrix4();
    const position = new Vector3();
    const orientation = new Quaternion();
    const scale = new Vector3();
    poses.forEach((pose, index) => {
      position.set(...pose.at);
      orientation.setFromEuler(new Euler(...(pose.rotation ?? [0, 0, 0])));
      matrix.compose(position, orientation, scale.setScalar(pose.scale ?? 1));
      mesh.current!.setMatrixAt(index, matrix);
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    mesh.current!.computeBoundingSphere();
    invalidate();
  }, [poses, invalidate]);
  return <instancedMesh ref={mesh} args={[shape, undefined, poses.length]} castShadow receiveShadow>
    <meshStandardMaterial {...finish} />
  </instancedMesh>;
}

function Ring({ xM, radiusM, centerYM, tubeM = 0.018 }: {
  xM: number; radiusM: number; centerYM: number; tubeM?: number;
}) {
  return <mesh position={[xM, centerYM, 0]} rotation={[0, Math.PI / 2, 0]}>
    <torusGeometry args={[radiusM, tubeM, 6, 64]} />
    <meshStandardMaterial {...finishes.metal} />
  </mesh>;
}

function HullSection({ startM, endM, offsetM, open, painted, name, cutaway }: {
  startM: number; endM: number; offsetM: number; open: boolean; painted: boolean; name: string; cutaway?: Cutaway;
}) {
  const outer = useGeometry(() => fuselageGeometry(startM, endM, false, cutaway), [startM, endM, cutaway]);
  const inner = useGeometry(() => fuselageGeometry(startM, endM, true), [startM, endM]);
  const ribs = open ? Array.from({ length: Math.floor((endM - startM) / 3) }, (_, i) => startM + 1 + i * 3) : [];
  return <group name={name} position={[offsetM, 0, 0]}>
    <mesh geometry={outer} castShadow receiveShadow><meshStandardMaterial {...(painted ? finishes.painted : finishes.primer)} /></mesh>
    {open && <>
      <mesh geometry={inner}><meshStandardMaterial {...finishes.metal} /></mesh>
      {ribs.map(x => {
        const p = bodyAt(x);
        return <Ring key={x} xM={x} centerYM={p.centerYM} radiusM={Math.max(0.1, p.radiusM - 0.11)} tubeM={0.025} />;
      })}
      {[startM, endM].filter(x => Math.abs(x) < 29).map(x => {
        const p = bodyAt(x);
        return <Ring key={x} xM={x} centerYM={p.centerYM} radiusM={p.radiusM - 0.03} tubeM={0.055} />;
      })}
    </>}
  </group>;
}

function GlassPatch({ startM, endM, low, high, side }: {
  startM: number; endM: number; low: number; high: number; side: number;
}) {
  const shape = useGeometry(() => bodyPatch(startM, endM, low, high, side), [startM, endM, low, high, side]);
  return <mesh geometry={shape}><meshStandardMaterial {...finishes.glass} /></mesh>;
}

function WindshieldPane({ side }: { side: number }) {
  const frame = useGeometry(() => cockpitWindshieldGeometry(side, true), [side]);
  const glass = useGeometry(() => cockpitWindshieldGeometry(side), [side]);
  return <group>
    <mesh geometry={frame}><meshStandardMaterial {...finishes.darkMetal} /></mesh>
    <mesh geometry={glass}><meshStandardMaterial {...finishes.glass} /></mesh>
  </group>;
}

function SurfaceLine({ points, color = '#829397' }: { points: number[]; color?: string }) {
  const shape = useGeometry(() => {
    const result = new BufferGeometry();
    result.setAttribute('position', new Float32BufferAttribute(points, 3));
    return result;
  }, [points]);
  return <lineLoop geometry={shape}><lineBasicMaterial color={color} /></lineLoop>;
}

function Windows({ sectioned }: { sectioned: boolean }) {
  const shape = useGeometry(() => {
    const outline = new Shape();
    outline.moveTo(-0.19, -0.18);
    outline.lineTo(-0.19, 0.18);
    outline.quadraticCurveTo(-0.19, 0.34, 0, 0.34);
    outline.quadraticCurveTo(0.19, 0.34, 0.19, 0.18);
    outline.lineTo(0.19, -0.18);
    outline.quadraticCurveTo(0.19, -0.34, 0, -0.34);
    outline.quadraticCurveTo(-0.19, -0.34, -0.19, -0.18);
    return new ShapeGeometry(outline);
  }, []);
  const poses = useMemo(() => [-1, 1].flatMap(side => Array.from({ length: 37 }, (_, i) => {
    const x = -18.2 + i * 1.03;
    if (doorPositionsM.some(door => Math.abs(x - door) < 0.9)) return null;
    const p = bodyAt(x);
    const offset = sectioned ? (x < -10 ? -2 : x > 13 ? 2 : 0) : 0;
    return { at: [x + offset, p.centerYM + p.radiusM * Math.sin(0.24),
      side * (p.radiusM * Math.cos(0.24) + 0.035)],
      rotation: [-side * 0.24, side === 1 ? 0 : Math.PI, 0] } as Pose;
  }).filter((pose): pose is Pose => pose !== null)), [sectioned]);
  return <group name="cabin-windows"><Instances shape={shape} poses={poses} finish={finishes.glass} /></group>;
}

function Doors() {
  return <group name="door-and-panel-lines">
    {[-1, 1].flatMap(side => doorPositionsM.map(x => {
      const points = [[-0.52, -0.38], [-0.52, 0.38], [-0.36, 0.43], [0.36, 0.43], [0.52, 0.38], [0.52, -0.38]];
      return <SurfaceLine key={`${side}-${x}`} points={points.flatMap(([dx, angle]) => {
        const body = bodyAt(x + dx);
        return [x + dx, body.centerYM + (body.radiusM + 0.045) * Math.sin(angle), side * (body.radiusM + 0.045) * Math.cos(angle)];
      })} />;
    }))}
  </group>;
}

function Body({ variant }: { variant: AircraftVariant }) {
  const sectioned = variant === 'sectioned';
  const painted = variant === 'complete' || variant === 'paint';
  const finished = variant === 'complete';
  const cutaway = variant === 'systems' || variant === 'cabin' ? variant : undefined;
  return <group name="fuselage">
    {sectioned ? <>
      <HullSection name="fuselage-aft" startM={-30} endM={-10} offsetM={-2} open painted={false} />
      <HullSection name="fuselage-centre" startM={-10} endM={13} offsetM={0} open painted={false} />
      <HullSection name="fuselage-forward" startM={13} endM={30} offsetM={2} open painted={false} />
    </> : <HullSection name="fuselage-joined" startM={-30} endM={30} offsetM={0} open={false} painted={painted} cutaway={cutaway} />}
    <Windows sectioned={sectioned} />
    <group name="cockpit" position={[sectioned ? 2 : 0, 0, 0]}>
      {[-1, 1].map(side => <group key={side} name={`cockpit-side-${side}`}>
        <WindshieldPane side={side} />
        <GlassPatch startM={23.65} endM={24.45} low={0.14} high={0.48} side={side} />
      </group>)}
    </group>
    {!sectioned && <>
      <Doors />
      {cutaway && <InteriorCutaway type={cutaway} />}
      {[-10, 13].map(x => {
        const p = bodyAt(x);
        return <Ring key={x} xM={x} centerYM={p.centerYM} radiusM={p.radiusM + 0.006} tubeM={0.008} />;
      })}
      {finished && [-1, 1].map(side => <Stripe key={side} side={side} />)}
    </>}
  </group>;
}

function InteriorCutaway({ type }: { type: Cutaway }) {
  const bounds = type === 'systems' ? { start: -2, end: 4, low: 0.20, high: 0.60 }
    : { start: -8, end: 0, low: -0.55, high: 0.50 };
  const frameEdges = useMemo(() => {
    const point = (x: number, angle: number) => {
      const body = bodyAt(x);
      const radius = body.radiusM + 0.06;
      return [x, body.centerYM + radius * Math.sin(angle), radius * Math.cos(angle)];
    };
    return [
      Array.from({ length: 17 }, (_, index) => point(bounds.start + (bounds.end - bounds.start) * index / 16, bounds.low)),
      Array.from({ length: 17 }, (_, index) => point(bounds.start + (bounds.end - bounds.start) * index / 16, bounds.high)),
      Array.from({ length: 9 }, (_, index) => point(bounds.start, bounds.low + (bounds.high - bounds.low) * index / 8)),
      Array.from({ length: 9 }, (_, index) => point(bounds.end, bounds.low + (bounds.high - bounds.low) * index / 8)),
    ];
  }, [bounds.end, bounds.high, bounds.low, bounds.start]);
  if (type === 'systems') return <group name="systems-cutaway">
    <mesh position={[1, 7.2, 2.35]}><boxGeometry args={[7.5, 1.7, 0.2]} /><meshStandardMaterial {...finishes.darkMetal} /></mesh>
    <mesh position={[1, 7.48, 2.52]}><boxGeometry args={[3.8, 0.9, 0.18]} /><meshStandardMaterial color="#9caeb3" roughness={0.55} /></mesh>
    <mesh position={[-1, 7.4, 2.63]}><boxGeometry args={[0.6, 0.7, 0.16]} /><meshStandardMaterial color="#b7c9bd" roughness={0.6} /></mesh>
    {[-0.4, 0, 0.4].map((offset, index) => <SurfaceLine key={index} color={index === 1 ? '#b69959' : '#397b84'}
      points={[-2.2, 6.65 + offset, 2.62, -1.1, 7.04 + offset, 2.64, 0.8, 6.76 + offset, 2.64, 2.8, 7.18 + offset, 2.62]} />)}
    <CutawayEdges edges={frameEdges} />
  </group>;
  return <group name="cabin-cutaway">
    <mesh position={[-4, 3.38, 0]}><boxGeometry args={[9, 0.22, 5.1]} /><meshStandardMaterial color="#74858b" roughness={0.8} /></mesh>
    {[-6.5, -4.4, -2.3, -0.2].map(x => <group key={x} name={`seat-row-${x}`}>
      {[-1.15, 0, 1.15].map(z => <group key={z} position={[x, 0, z]}>
        <mesh position={[0, 3.82, 0]}><boxGeometry args={[0.9, 0.15, 0.76]} /><meshStandardMaterial color="#647982" roughness={0.78} /></mesh>
        <mesh position={[-0.27, 4.26, 0]}><boxGeometry args={[0.18, 0.78, 0.7]} /><meshStandardMaterial color="#788c93" roughness={0.78} /></mesh>
        <mesh position={[-0.27, 4.7, 0]}><boxGeometry args={[0.2, 0.3, 0.46]} /><meshStandardMaterial color="#87999b" roughness={0.82} /></mesh>
        <mesh position={[0.02, 3.98, 0]} scale={[0.49, 0.16, 0.4]}><sphereGeometry args={[1, 14, 10]} />
          <meshStandardMaterial color="#798e94" roughness={0.88} /></mesh>
        {[-1, 1].map(side => <group key={side}>
          <mesh position={[-0.02, 4.02, side * 0.44]}><boxGeometry args={[0.52, 0.12, 0.08]} /><meshStandardMaterial color="#657a81" roughness={0.82} /></mesh>
          <mesh position={[-0.3, 3.57, side * 0.29]}><boxGeometry args={[0.13, 0.4, 0.13]} /><meshStandardMaterial {...finishes.metal} /></mesh>
        </group>)}
        <mesh position={[0.29, 3.69, 0]}><boxGeometry args={[0.12, 0.36, 0.12]} /><meshStandardMaterial {...finishes.metal} /></mesh>
      </group>)}
    </group>)}
    {[-1, 1].map(side => <group key={side} name={`overhead-bin-${side}`}>
      <mesh position={[-4, 7.82, side * 1.76]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.46, 0.46, 7, 24, 1, true, 0, Math.PI]} />
        <meshStandardMaterial color="#aeb9b8" roughness={0.8} side={2} />
      </mesh>
      <mesh position={[-4, 7.57, side * 1.76]}><boxGeometry args={[7.05, 0.1, 0.62]} />
        <meshStandardMaterial color="#71848b" roughness={0.8} /></mesh>
      {[-7, -1].map(x => <mesh key={x} position={[x, 7.45, side * 1.76]}>
        <boxGeometry args={[0.08, 0.22, 0.62]} /><meshStandardMaterial {...finishes.metal} />
      </mesh>)}
    </group>)}
    {[-1, 1].map(side => <mesh key={side} position={[-4, 7.8, side * 1.75]}>
      <boxGeometry args={[7.0, 0.34, 0.72]} /><meshStandardMaterial color="#abb8ba" roughness={0.75} />
    </mesh>)}
    <CutawayEdges edges={frameEdges} />
  </group>;
}

function CutawayEdges({ edges }: { edges: number[][][] }) {
  return <group name="access-panel-trim">{edges.map((points, index) => <SurfaceLine key={index}
    color="#809197" points={points.flat()} />)}</group>;
}

function Stripe({ side }: { side: number }) {
  const shape = useGeometry(() => bodyPatch(-19.5, 21, 0.015, 0.055, side), [side]);
  return <mesh geometry={shape}><meshStandardMaterial {...finishes.accent} /></mesh>;
}

function Wings() {
  const shape = useGeometry(wingGeometry, []);
  return <group name="wings">
    <mesh position={[-2, 4, 0]} scale={[10, 1.15, 2.7]} castShadow>
      <sphereGeometry args={[1, 32, 16]} /><meshStandardMaterial {...finishes.wing} />
    </mesh>
    {[-1, 1].map(side => <group key={side} name={side === 1 ? 'wing-right' : 'wing-left'}
      position={[0, 0, side * 2.8]} scale={[1, 1, side]}>
      <mesh geometry={shape} castShadow receiveShadow><meshStandardMaterial {...finishes.wing} /></mesh>
      <SurfaceLine points={[4.5, 4.94, 0, 0.5, 5.14, 5, -4, 5.54, 12, -10.2, 6.14, 23,
        -12.8, 6.54, 27.2, -13.6, 6.54, 27.2, -11.6, 6.14, 23, -7.5, 5.54, 12, -5, 5.14, 5, -3.5, 4.94, 0]} />
    </group>)}
  </group>;
}

function Tail({ painted }: { painted: boolean }) {
  const fin = useGeometry(tailFinGeometry, []);
  const horizontal = useGeometry(stabilizerGeometry, []);
  const accent = useGeometry(() => polygonPrism([[-25.9, 16.5], [-28.9, 16.35], [-28.7, 11.2], [-22.5, 11.2]], 0.38), []);
  return <group name="tail">
    <group name="vertical-stabilizer">
      <mesh geometry={fin} castShadow><meshStandardMaterial {...(painted ? finishes.painted : finishes.primer)} /></mesh>
      {painted && <mesh geometry={accent}><meshStandardMaterial {...finishes.accent} /></mesh>}
    </group>
    {[-1, 1].map(side => <group key={side} name={`horizontal-stabilizer-${side}`} position={[0, 0, side * 1.5]} scale={[1, 1, side]}>
      <mesh geometry={horizontal} castShadow><meshStandardMaterial {...finishes.wing} /></mesh>
    </group>)}
  </group>;
}

function Engine() {
  const cowl = useGeometry(nacelleGeometry, []);
  const blade = useGeometry(fanBladeGeometry, []);
  const fan = useMemo(() => Array.from({ length: 32 }, (_, i) => ({
    at: [1.92, 0, 0] as [number, number, number], rotation: [i * Math.PI * 2 / 32, Math.PI / 2, 0] as [number, number, number],
  })), []);
  return <group>
    <mesh geometry={cowl} castShadow><meshStandardMaterial {...finishes.painted} /></mesh>
    <mesh position={[2.6, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[1.57, 0.105, 12, 64]} /><meshStandardMaterial {...finishes.metal} />
    </mesh>
    <mesh position={[2.35, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <cylinderGeometry args={[1.49, 1.32, 1.3, 64, 1, true]} /><meshStandardMaterial {...finishes.duct} />
    </mesh>
    <Instances shape={blade} poses={fan} finish={finishes.darkMetal} />
    <mesh position={[2.2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <coneGeometry args={[0.3, 0.7, 32]} /><meshStandardMaterial {...finishes.darkMetal} />
    </mesh>
    <mesh position={[-2.6, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <cylinderGeometry args={[0.65, 0.65, 1.1, 48, 1, true]} /><meshStandardMaterial {...finishes.duct} />
    </mesh>
  </group>;
}

function Engines({ variant }: { variant: AircraftVariant }) {
  const pylon = useGeometry(() => polygonPrism([[-1.2, 4.9], [2.5, 5.0], [4, 3.7], [-1, 3.7]], 0.5), []);
  return <group name="engines">
    {[-1, 1].map(side => <group key={side} name={side === 1 ? 'engine-right' : 'engine-left'}>
      <mesh geometry={pylon} position={[0, 0, side * 11]} castShadow><meshStandardMaterial {...finishes.wing} /></mesh>
      {['engine-install', 'cabin', 'complete', 'paint'].includes(variant) &&
        <group position={[3.2, 2.95, side * 11]}><Engine /></group>}
    </group>)}
  </group>;
}

function Gear() {
  const tire = useGeometry(() => new TorusGeometry(0.62, 0.23, 12, 32), []);
  const hub = useGeometry(() => new CylinderGeometry(0.35, 0.35, 0.46, 24).rotateX(Math.PI / 2), []);
  const wheels = useMemo(() => [
    ...[-1, 1].flatMap(side => [-4.7, -3.2, -1.7].flatMap(x => [-0.55, 0.55].map(dz => ({
      at: [x, 0.85, side * 3.2 + dz] as [number, number, number],
    })))),
    ...[-0.47, 0.47].map(z => ({ at: [21.2, 0.72, z] as [number, number, number], scale: 0.72 / 0.85 })),
  ], []);
  return <group name="landing-gear">
    <Instances shape={tire} poses={wheels} finish={finishes.rubber} />
    <Instances shape={hub} poses={wheels} finish={finishes.metal} />
    {[-1, 1].map(side => <group key={side} name={`main-gear-${side}`}>
      <mesh position={[-3.2, 2.65, side * 3.2]} castShadow>
        <cylinderGeometry args={[0.16, 0.21, 3.6, 16]} /><meshStandardMaterial {...finishes.metal} />
      </mesh>
      <mesh position={[-3.2, 1.04, side * 3.2]} castShadow>
        <boxGeometry args={[3.7, 0.25, 0.35]} /><meshStandardMaterial {...finishes.darkMetal} />
      </mesh>
      <mesh position={[-2.5, 2.6, side * 3.2]} rotation={[0, 0, -0.5]}>
        <cylinderGeometry args={[0.07, 0.07, 2.8, 12]} /><meshStandardMaterial {...finishes.metal} />
      </mesh>
    </group>)}
    <group name="nose-gear">
      <mesh position={[21.2, 1.96, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 2.5, 16]} /><meshStandardMaterial {...finishes.metal} />
      </mesh>
      <mesh position={[21.2, 0.8, 0]}><boxGeometry args={[0.25, 0.25, 1]} /><meshStandardMaterial {...finishes.darkMetal} /></mesh>
    </group>
  </group>;
}

function Cradles() {
  return <group name="section-supports">
    {[-20, 0, 21].map(x => {
      const p = bodyAt(x);
      const offset = x < -10 ? -2 : x > 13 ? 2 : 0;
      const contactY = p.centerYM - p.radiusM * Math.sqrt(0.75);
      return <group key={x} position={[x + offset, 0, 0]}>
        <mesh position={[0, 0.24, 0]} castShadow><boxGeometry args={[4.2, 0.3, 7.6]} /><meshStandardMaterial {...finishes.darkMetal} /></mesh>
        {[-1, 1].map(side => <group key={side}>
          <mesh position={[0, 0.16, side * 3.15]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.32, 0.12, 8, 20]} /><meshStandardMaterial color="#3e4b50" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.16, side * 3.15]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.25, 12]} /><meshStandardMaterial {...finishes.metal} />
          </mesh>
          <SupportStrut from={[0, 0.55, side * 3.1]} to={[0, contactY - 0.18, side * p.radiusM * 0.48]} />
          <mesh position={[0, contactY, side * p.radiusM * 0.5]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.24, 0.24, 1.8, 16]} /><meshStandardMaterial color="#43565d" roughness={0.86} />
          </mesh>
          <Block at={[0, contactY + 0.2, side * p.radiusM * 0.5]} size={[1.8, 0.12, 0.7]} color="#b39a59" />
        </group>)}
        <Block at={[0, 0.48, 0]} size={[0.25, 0.2, 6.3]} color={finishes.metal.color as string} />
      </group>;
    })}
  </group>;
}

function SupportStrut({ from, to }: {
  from: [number, number, number]; to: [number, number, number];
}) {
  const start = new Vector3(...from);
  const end = new Vector3(...to);
  const direction = end.clone().sub(start);
  const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
  return <mesh position={start.add(end).multiplyScalar(0.5)} quaternion={orientation} castShadow>
    <cylinderGeometry args={[0.14, 0.18, direction.length(), 12]} /><meshStandardMaterial {...finishes.metal} />
  </mesh>;
}

export const Aircraft = memo(function Aircraft({ variant, positionM, id, rotationY }: {
  variant: AircraftVariant; positionM: [number, number, number]; id: string; rotationY?: number;
}) {
  const onWheels = ['engine-install', 'cabin', 'complete', 'paint'].includes(variant);
  return <group name={id} position={positionM} rotation={[0, rotationY ?? 0, 0]}>
    <Body variant={variant} />
    {variant === 'sectioned' ? <Cradles /> : <>
      <Wings /><Tail painted={variant === 'complete'} />
      {onWheels ? <Gear /> : <Cradles />}
      <Engines variant={variant} />
    </>}
  </group>;
});
