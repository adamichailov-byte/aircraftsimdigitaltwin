import { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Mesh, PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three-stdlib';
import { homePositionM, homeTargetM } from '../demo/campus';
import { fitCameraToBounds } from './camera-focus';
import { summarizeFrames } from './frame-summary';

type Run = {
  view: 'overview' | 'bay2'; started: number; last: number; published: number;
  intervals: number[]; target: Vector3; offset: Vector3;
  calls: number[]; triangles: number[];
};
const up = new Vector3(0, 1, 0);
const samplePosition = new Vector3();

/** Developer-only controlled benchmark. Never runs on the normal demo URL. */
export function RenderDiagnostics({onFreeze,contextLabel}:{onFreeze:()=>void;contextLabel:string}) {
  const { camera, controls, scene, gl, size, invalidate } = useThree();
  const run = useRef<Run | null>(null);
  const [report, setReport] = useState('Ready: 5s warm-up, then 30s sample. Current fleet will be paused.');
  const [inventory, setInventory] = useState('');
  const firstRenderedFrameMs = useRef<number | null>(null);
  const orbit = controls as OrbitControls | null;

  useEffect(() => {
    const cancelHidden = () => {
      if (document.hidden && run.current) {
        run.current = null;
        setReport('Canceled: tab became hidden. No incomplete result reported.');
      }
    };
    document.addEventListener('visibilitychange', cancelHidden);
    return () => document.removeEventListener('visibilitychange', cancelHidden);
  }, []);

  function start(view: Run['view']) {
    if (!orbit) return;
    onFreeze();
    const fit = view === 'overview' ? { position: homePositionM, target: homeTargetM }
      : fitCameraToBounds([-40, -145], [82, 82], size.width, size.height, 252, (camera as PerspectiveCamera).fov);
    camera.position.fromArray(fit.position);
    orbit.target.fromArray(fit.target);
    orbit.update();
    const geometryCounts: Record<string, number> = {};
    const geometries = new Set(), materials = new Set();
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      geometryCounts[object.geometry.type] = (geometryCounts[object.geometry.type] ?? 0) + 1;
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    });
    setInventory(JSON.stringify({ meshesByGeometry: geometryCounts, geometries: geometries.size, materials: materials.size }));
    run.current = { view, started: performance.now(), last: 0, published: 0, intervals: [],
      target: new Vector3(...fit.target), offset: new Vector3(...fit.position).sub(new Vector3(...fit.target)),
      calls: [], triangles: [] };
    setReport(view + ': warming up');
    invalidate();
  }

  useFrame(() => {
    if (firstRenderedFrameMs.current === null && gl.info.render.frame > 0) {
      firstRenderedFrameMs.current = Math.round(performance.now());
    }
    const sample = run.current;
    if (!sample || !orbit) return;
    invalidate();
    const now = performance.now();
    const elapsed = now - sample.started;
    if (sample.view === 'overview') {
      samplePosition.copy(sample.offset).applyAxisAngle(up, Math.sin(elapsed / 35_000 * Math.PI * 2) * 0.22);
      camera.position.copy(samplePosition).add(sample.target);
      orbit.target.copy(sample.target);
      orbit.update();
    }
    if (elapsed < 5000) { sample.last = now; return; }
    if (sample.last) {
      sample.intervals.push(now - sample.last);
      sample.calls.push(gl.info.render.calls);
      sample.triangles.push(gl.info.render.triangles);
    }
    sample.last = now;
    if (now - sample.published < 1000 && elapsed < 35000) return;
    sample.published = now;
    const stats = summarizeFrames(sample.intervals);
    const average = (values: number[]) => Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
    const context = gl.getContext();
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    setReport(JSON.stringify({
      view: sample.view, status: elapsed >= 35000 ? 'complete' : 'sampling',
      fleetContext:contextLabel,
      ...stats, averageCalls: average(sample.calls), averageTriangles: average(sample.triangles),
      viewport: [window.innerWidth, window.innerHeight], canvas: [size.width, size.height],
      dpr: gl.getPixelRatio(), shadows: gl.shadowMap.enabled,
      renderer: debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER),
      hardwareThreads: navigator.hardwareConcurrency, userAgent: navigator.userAgent,
      firstRenderedFrameMs: firstRenderedFrameMs.current,
    }));
    if (elapsed >= 35000) run.current = null;
  });

  return <Html fullscreen zIndexRange={[3, 3]} style={{pointerEvents:'none'}}>
    <section style={{ position: 'absolute', right: 12, top: 12, maxWidth: 470,
      pointerEvents:'auto', padding: 10, borderRadius: 5, color: '#fff', background: '#17242df2', font: '12px/1.45 ui-monospace, monospace' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, color: '#17242d' }}>
        <button onClick={() => start('overview')}>Measure overview</button>
        <button onClick={() => start('bay2')}>Measure Bay02</button>
        <button onClick={() => { run.current = null; setReport('Canceled.'); }}>Cancel sample</button>
        <button onClick={() => { run.current = null; gl.shadowMap.enabled = !gl.shadowMap.enabled;
          invalidate(); setReport('Shadows ' + (gl.shadowMap.enabled ? 'on' : 'off') + '. Start a fresh sample.'); }}>Toggle shadows</button>
      </div>
      <output data-testid="render-diagnostics" style={{ display: 'block', overflowWrap: 'anywhere' }}>{report}</output>
      <details><summary>Scene inventory</summary><output data-testid="scene-inventory">{inventory}</output></details>
    </section>
  </Html>;
}
