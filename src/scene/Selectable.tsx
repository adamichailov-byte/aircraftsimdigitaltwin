import type { ReactNode } from 'react';
import { Block } from './Building';
import { isSelectionClick, type InspectableEntity } from '../demo/entities';

export function Selectable({ entity, selected, onSelect, children }: {
  entity: InspectableEntity; selected: boolean; onSelect: (id: string) => void; children: ReactNode;
}) {
  const [x, y, z] = entity.positionM;
  const [length, height, width] = entity.sizeM;
  return <group name={`selectable-${entity.id}`} onClick={event => {
    event.stopPropagation();
    if (isSelectionClick(event.button, event.delta)) onSelect(entity.id);
  }}>
    {children}
    {entity.kind !== 'aircraft' && <mesh position={[x, y + height / 2, z]}>
      <boxGeometry args={[Math.max(3, length), Math.max(3, height), Math.max(3, width)]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>}
    {selected && <group position={[x, entity.kind === 'person' ? 0.16 : 0.86, z]}>
      {[-1, 1].map(side => <group key={side}>
        <Block at={[0, 0, side * (width / 2 + 0.7)]} size={[length + 1.4, 0.04, 0.3]} color="#286a78" shadow={false} />
        <Block at={[side * (length / 2 + 0.7), 0, 0]} size={[0.3, 0.04, width + 1.4]} color="#286a78" shadow={false} />
      </group>)}
    </group>}
  </group>;
}

export function StaticPerson({ entity }: { entity: InspectableEntity }) {
  return <group position={entity.positionM} name={entity.id}>
    <Block at={[0, 1.03, 0]} size={[0.44, 0.62, 0.25]} color="#b39a59" />
    {[-1, 1].map(side => <group key={side}>
      <Block at={[side * 0.12, 0.38, 0]} size={[0.16, 0.76, 0.2]} color="#526770" />
      <Block at={[side * 0.32, 0.94, 0]} size={[0.14, 0.58, 0.16]} color="#70838a" />
      <Block at={[side * 0.12, 0.06, 0.06]} size={[0.2, 0.12, 0.32]} color="#3d484d" />
    </group>)}
    <mesh position={[0, 1.53, 0]} castShadow>
      <sphereGeometry args={[0.17, 12, 10]} /><meshStandardMaterial color="#b99e88" roughness={0.9} />
    </mesh>
    <mesh position={[0, 1.64, 0]} castShadow>
      <sphereGeometry args={[0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#e1dfc9" roughness={0.8} />
    </mesh>
  </group>;
}
