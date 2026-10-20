import { useEffect, useMemo } from 'react';
import type { InspectableEntity } from '../demo/entities';
import { siteRoutes, type RoutePointM, type SiteRoute } from '../demo/routes';
import { Block } from '../scene/Building';
import { wingGeometry } from './aircraft-parts';

function segmentPose(start: RoutePointM, end: RoutePointM) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  return { center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2] as RoutePointM,
    length: Math.hypot(dx, dz), angle: Math.atan2(-dz, dx) };
}

function RouteMarks({ route }: { route: SiteRoute }) {
  const pedestrian = route.mode === 'pedestrian';
  const color = pedestrian ? '#9db5b9' : route.mode === 'aircraft-tow' ? '#f0c94e' : '#6c898d';
  return <group name={`route-${route.id}`}>
    {route.pointsM.slice(1).map((point, index) => {
      const pose = segmentPose(route.pointsM[index], point);
      const surfaceY = pedestrian ? 0.48 : route.mode === 'aircraft-tow' ? 0.74 : 0.54;
      const cornerOverlapM = route.mode === 'aircraft-tow' ? 1.2 : 0;
      return <group key={index} position={[pose.center[0], surfaceY, pose.center[1]]} rotation={[0, pose.angle, 0]}>
        <Block at={[0, 0, 0]}
          size={[pose.length + cornerOverlapM, pedestrian ? 0.92 : 0.035, pedestrian ? route.clearWidthM : route.mode === 'aircraft-tow' ? 0.42 : 1.15]}
          color={color} shadow={false} />
      </group>;
    })}
    {!pedestrian && route.mode !== 'aircraft-tow' && route.dwellPointsM.map(([xM, zM], index) => <mesh key={`dwell-${index}`}
      position={[xM, 0.84, zM]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[2.4, 0.13, 6, 24]} /><meshStandardMaterial color="#b39a59" roughness={0.85} />
    </mesh>)}
  </group>;
}

function Crosswalk({ at, acrossX }: { at: RoutePointM; acrossX: boolean }) {
  const [xM, zM] = at;
  const count = acrossX ? 17 : 4;
  return <group name="marked-pedestrian-crossing">
    {Array.from({ length: count }, (_, index) => {
      const offset = (index - (count - 1) / 2) * (acrossX ? 5 : 2.2);
      return <Block key={index}
        at={[xM + (acrossX ? offset : 0), 0.96, zM + (acrossX ? 0 : offset)]}
        size={acrossX ? [1.15, 0.035, 5.4] : [8, 0.035, 0.8]} color="#e2e8e5" shadow={false} />;
    })}
  </group>;
}

export function LogisticsRoutes() {
  return <group>
    {siteRoutes.map(route => <RouteMarks key={route.id} route={route} />)}
    <Crosswalk at={[420, -282]} acrossX />
    <Crosswalk at={[-460, -263]} acrossX={false} />
  </group>;
}

function WingCradle() {
  const geometry = useMemo(wingGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group name="receiving-wing-kit-cradle">
    <mesh position={[0, -2, 0]} geometry={geometry} scale={[0.45, 0.7, 0.45]} castShadow>
      <meshStandardMaterial color="#c5cbca" roughness={0.82} />
    </mesh>
    {[-1, 1].flatMap(x => [-1, 1].map(z => <mesh key={`${x}-${z}`}
      position={[x * 12, 0.42, z * 10]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[0.72, 0.72, 0.38, 14]} /><meshStandardMaterial color="#34454b" roughness={0.95} />
    </mesh>))}
    {[-11, 11].map(z => <group key={z}>
      <Block at={[0, 1.1, z]} size={[3.6, 2.2, 3.2]} color="#586b73" />
      <Block at={[0, 2.28, z]} size={[4.2, 0.24, 3.8]} color="#b39a59" />
      <Block at={[0, 0.18, z]} size={[5.6, 0.3, 4.8]} color="#526770" />
    </group>)}
  </group>;
}

function EngineCradle() {
  return <group name="receiving-engine-transport-cradle">
    <Block at={[0, 0.3, 0]} size={[13, 0.6, 7.4]} color="#586b73" />
    {[-1, 1].flatMap(x => [-1, 1].map(z => <mesh key={`${x}-${z}`}
      position={[x * 5, 0.52, z * 2.8]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[0.58, 0.58, 0.32, 14]} /><meshStandardMaterial color="#34454b" roughness={0.95} />
    </mesh>))}
    {[-4.4, 4.4].map(x => <group key={x}>
      <Block at={[x, 1.4, 0]} size={[0.65, 2.2, 5.8]} color="#71848b" />
      <Block at={[x, 2.62, 0]} size={[1.7, 0.2, 4.8]} color="#b39a59" />
    </group>)}
    <mesh position={[0, 3.1, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[1.75, 2.15, 7.2, 24]} /><meshStandardMaterial color="#71848b" roughness={0.74} />
    </mesh>
    <mesh position={[0, 3.1, 0]} rotation={[0, 0, Math.PI / 2]}>
      <torusGeometry args={[1.75, 0.12, 8, 24]} /><meshStandardMaterial color="#526770" roughness={0.8} />
    </mesh>
  </group>;
}

export function ReceivingHandling({ entity }: { entity: InspectableEntity }) {
  if (entity.id === 'receiving-wing-stand') return <WingCradle />;
  if (entity.id === 'receiving-engine-stand') return <EngineCradle />;
  return null;
}
