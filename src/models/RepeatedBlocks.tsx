import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { Intersection, Object3D, Raycaster } from 'three';

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


type BlockEntry = { object: Group; color: Color };
type BlockRegistry = {
  entries: Set<BlockEntry>; invalidate: () => void;
  picker: Mesh; intersections: Intersection[];
  world: { preparedFrame: number };
};
const BlockContext = createContext<{ shadow: BlockRegistry; flat: BlockRegistry } | null>(null);
const BLOCK_LIMIT = 4096;

function visibleInTree(object: Object3D) {
  for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

function BlockDraw({ registry, geometry, material, shadow }: {
  registry: BlockRegistry; geometry: BoxGeometry; material: MeshStandardMaterial; shadow: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const { scene } = useThree();
  const scratch = useMemo(() => ({ inverse: new Matrix4(), matrix: new Matrix4(),
    position: new Vector3(), rotation: new Quaternion(), scale: new Vector3() }), []);
  useLayoutEffect(() => {
    const instance = mesh.current!;
    return () => { instance.dispose(); };
  }, []);

  // This sibling subscribes after campus actors. Prepare matrices before the
  // renderer uploads instance buffers, including single demand-mode frames.
  useFrame(({ gl }) => {
    if (registry.world.preparedFrame !== gl.info.render.frame) {
      scene.updateMatrixWorld();
      registry.world.preparedFrame = gl.info.render.frame;
    }
    const instance = mesh.current!;
    scratch.inverse.copy(instance.matrixWorld).invert();
    let index = 0;
    for (const entry of registry.entries) {
      if (!visibleInTree(entry.object)) continue;
      if (index >= BLOCK_LIMIT) throw new Error('Block batch capacity exceeded');
      scratch.matrix.multiplyMatrices(scratch.inverse, entry.object.matrixWorld);
      // Boxes are symmetric; remove reflected scale so instanced normals stay valid.
      scratch.matrix.decompose(scratch.position, scratch.rotation, scratch.scale);
      scratch.scale.set(Math.abs(scratch.scale.x), Math.abs(scratch.scale.y), Math.abs(scratch.scale.z));
      scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale);
      instance.setMatrixAt(index, scratch.matrix);
      instance.setColorAt(index, entry.color);
      index++;
    }
    instance.count = index;
    instance.instanceMatrix.needsUpdate = true;
    if (instance.instanceColor) instance.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geometry, material, BLOCK_LIMIT]} dispose={null}
    name={shadow ? 'batched-shadow-blocks' : 'batched-flat-blocks'}
    castShadow={shadow} receiveShadow frustumCulled={false} raycast={() => {}} />;
}

/** Share the existing block primitive across the campus; retain original scene
 * groups for transforms, visibility and event bubbling. No geometry is omitted. */
export function BlockInstances({ children }: { children: ReactNode }) {
  const invalidate = useThree(state => state.invalidate);
  const resources = useMemo(() => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial({ roughness: 0.85 });
    const world = { preparedFrame: -1 };
    const registry = (): BlockRegistry => ({ entries: new Set(), invalidate,
      picker: new Mesh(geometry, material), intersections: [], world });
    return { geometry, material, shadow: registry(), flat: registry() };
  }, [invalidate]);
  useEffect(() => () => {
    resources.geometry.dispose();
    resources.material.dispose();
  }, [resources]);
  return <BlockContext.Provider value={resources}>
    {children}
    <BlockDraw registry={resources.shadow} geometry={resources.geometry} material={resources.material} shadow />
    <BlockDraw registry={resources.flat} geometry={resources.geometry} material={resources.material} shadow={false} />
  </BlockContext.Provider>;
}

export function InstancedBlock({ at, size, color, shadow = true }: {
  at: [number, number, number]; size: [number, number, number]; color: string; shadow?: boolean;
}) {
  const context = useContext(BlockContext);
  const object = useRef<Group>(null);
  const invalidate = useThree(state => state.invalidate);
  const entry = useMemo(() => ({ object: null as unknown as Group, color: new Color() }), []);
  const registry = context ? (shadow ? context.shadow : context.flat) : null;
  useLayoutEffect(() => {
    if (!registry) return;
    entry.object = object.current!;
    registry.entries.add(entry);
    invalidate();
    return () => { registry.entries.delete(entry); invalidate(); };
  }, [registry, entry, invalidate]);
  useLayoutEffect(() => { entry.color.set(color); invalidate(); }, [color, entry, invalidate]);

  if (!registry) return <mesh position={at} castShadow={shadow} receiveShadow>
    <boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.85} />
  </mesh>;

  function raycast(raycaster: Raycaster, intersections: Intersection[]) {
    if (!registry || !object.current || !visibleInTree(object.current)) return;
    registry.picker.matrixWorld.copy(object.current.matrixWorld);
    registry.intersections.length = 0;
    registry.picker.raycast(raycaster, registry.intersections);
    for (const hit of registry.intersections) {
      hit.object = object.current;
      intersections.push(hit);
    }
  }
  return <group ref={object} position={at} scale={size} raycast={raycast} />;
}
