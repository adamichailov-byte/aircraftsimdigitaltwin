import type { BuildingSpec } from '../demo/campus';

export function Block({ at, size, color, shadow = true }: {
  at: [number, number, number]; size: [number, number, number]; color: string; shadow?: boolean;
}) {
  return <mesh position={at} castShadow={shadow} receiveShadow>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={0.85} />
  </mesh>;
}

export function Building({ spec, roofs, showBeams }: { spec: BuildingSpec; roofs: boolean; showBeams: boolean }) {
  const { lengthM: length, widthM: width, heightM: height, doorWidthM: door,
    doorHeightM: opening, centerM } = spec;
  const columns = Math.ceil(length / 48);
  const sideHeight = roofs ? height : 2;
  const endSegment = (width - door) / 2;
  return <group position={[centerM[0], 0.7, centerM[1]]}>
    <Block at={[0, height / 2, -width / 2]} size={[length, height, 1.4]} color="#aab7bd" />
    <Block at={[0, sideHeight / 2, width / 2]} size={[length, sideHeight, 1.4]} color="#bfc9ce" />
    {[-1, 1].map(end => <group key={end} position={[end * length / 2, 0, 0]}>
      {[-1, 1].map(side => <Block key={side}
        at={[0, sideHeight / 2, side * (door / 2 + endSegment / 2)]}
        size={[1.4, sideHeight, endSegment]} color="#bfc9ce" />)}
      <Block at={[0, opening + (height - opening) / 2, 0]}
        size={[1.8, height - opening, door]} color="#aab7bd" />
      {[-1, 1].map(side => <Block key={side} at={[0, opening / 2, side * (door / 2 + 1)]}
        size={[2.2, opening, 2]} color="#60737c" />)}
    </group>)}
    {Array.from({ length: columns + 1 }, (_, index) => {
      const xM = -length / 2 + 3 + index * (length - 6) / columns;
      return <group key={index}>
        {[-1, 1].map(side => <Block key={side} at={[xM, height / 2, side * (width / 2 - 2)]}
          size={[1.8, height, 1.8]} color="#687c85" />)}
        {showBeams && <Block at={[xM, height + 0.8, 0]} size={[1.2, 1.6, width]} color="#81939c" />}
      </group>;
    })}
    {showBeams && [-1, 1].map(side => <Block key={side} at={[0, height + 1, side * (width / 2 - 2)]}
      size={[length, 2, 1.8]} color="#5c717b" />)}
    {spec.id === 'assembly' && [-72, 72].map(xM => <group key={xM}>
      {[-115, 115].map(zM => <Block key={zM} at={[xM, height / 2, zM]}
        size={[2, height, 2]} color="#687c85" />)}
      {showBeams && <Block at={[xM, height + 0.8, 0]} size={[1.8, 1.6, width]} color="#81939c" />}
    </group>)}
    {roofs ? <group>
      <Block at={[0, height + 1.5, 0]} size={[length + 5, 2.2, width + 5]} color="#e3e8eb" />
      {[-1, 1].map(side => <Block key={side} at={[0, height + 2.65, side * width * 0.27]}
        size={[length - 10, 0.12, 7]} color="#a9bec8" shadow={false} />)}
      {Array.from({ length: columns + 1 }, (_, index) => <Block key={index}
        at={[-length / 2 + index * length / columns, height + 2.65, 0]}
        size={[0.25, 0.1, width + 4]} color="#c5d0d6" shadow={false} />)}
    </group> : <Block at={[0, height + 0.8, -width * 0.42]}
      size={[length + 4, 1.2, width * 0.18]} color="#e3e8eb" />}
  </group>;
}
