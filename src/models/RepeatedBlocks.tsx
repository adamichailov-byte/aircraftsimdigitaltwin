import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { BoxGeometry, InstancedMesh, Matrix4 } from 'three';

export type BlockPose = { at: [number, number, number]; size: [number, number, number] };

export function RepeatedBlocks({ items, color }: { items: BlockPose[]; color: string }) {
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const matrix = new Matrix4();
    items.forEach(({ at, size }, index) => {
      matrix.makeScale(...size).setPosition(...at);
      mesh.current!.setMatrixAt(index, matrix);
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    mesh.current!.computeBoundingSphere();
    invalidate();
  }, [items, invalidate]);
  return <instancedMesh ref={mesh} args={[geometry, undefined, items.length]} castShadow receiveShadow>
    <meshStandardMaterial color={color} roughness={0.78} />
  </instancedMesh>;
}
