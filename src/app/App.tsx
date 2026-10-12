import { Component, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Campus } from '../scene/Campus';
import { parcel } from '../demo/campus';
import { ProcessList } from '../ui/ProcessList';
import { CameraRig, type CameraCommand, type CameraCommandHandle } from '../scene/CameraRig';
import { ZoneLabels } from '../scene/ZoneLabels';
import { Inspector } from '../ui/Inspector';
import { inspectableEntities, isSelectionClick, selectEntityById, type SceneSelection } from '../demo/entities';
import { zones } from '../demo/zones';
import { bindClockToDocument, demoClock } from '../demo/clock';
import { Playback } from '../ui/Playback';
import { cameraCommandForKey } from '../scene/camera-keyboard';
const HOME_POSITION: [number, number, number] = [800, 950, 1150];
const CAMERA_CONFIG = { position: HOME_POSITION, fov: 40, near: 0.5, far: 5000 };

function RendererUnavailable() {
  return <div className="renderer-error" role="alert">
    <h2>The 3D view couldn’t open</h2>
    <p>This viewer needs WebGL 2. Enable browser hardware acceleration and reload, or try another browser.</p>
    <button onClick={() => window.location.reload()}>Reload viewer</button>
  </div>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <RendererUnavailable /> : this.props.children; }
}

export function App() {
  const commands = useRef<CameraCommandHandle | null>(null);
  const [help, setHelp] = useState(false);
  const [roofs, setRoofs] = useState(false);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showBeams, setShowBeams] = useState(true);
  const [processOpen, setProcessOpen] = useState(() => window.innerWidth > 1024);
  const [compact, setCompact] = useState(() => window.innerWidth <= 700);
  const [selection, setSelection] = useState<SceneSelection>({ zoneId: null, entityId: null });
  const [keyboardPanning, setKeyboardPanning] = useState(false);
  const heldCameraKeys = useRef(new Set<string>());
  const playback = useSyncExternalStore(demoClock.subscribe, demoClock.getSnapshot, demoClock.getSnapshot);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const selectedZoneId = selection.zoneId;
  const selectedEntity = inspectableEntities.find(entity => entity.id === selection.entityId);
  const selectedZone = zones.find(zone => zone.id === selectedZoneId);
  const canvasHost = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const gesture = useRef({ x: 0, y: 0, distance: 0 });
  const options = useRef<HTMLDetailsElement>(null);
  const clearances = new URLSearchParams(window.location.search).has('clearance');
  const selectZone = (zoneId: string) => {
    if (window.innerWidth <= 1024) setProcessOpen(false);
    setSelection({ zoneId, entityId: null });
    setInspectionOpen(true);
    setRoofs(false);
    commands.current?.run({ type: 'focus', zoneId });
  };
  const selectEntity = (id: string, trigger?: HTMLElement) => {
    const next = selectEntityById(id);
    if (!next) return;
    if (window.innerWidth <= 1024) setProcessOpen(false);
    returnFocus.current = trigger ?? canvasHost.current?.querySelector('canvas') ?? null;
    setSelection(next);
    setInspectionOpen(true);
    setRoofs(false);
    if (next.zoneId !== selectedZoneId) commands.current?.run({ type: 'focus', zoneId: next.zoneId! });
  };
  const closeInspection = () => {
    setInspectionOpen(false);
    setSelection(current => ({ ...current, entityId: null }));
    requestAnimationFrame(() => {
      const trigger = returnFocus.current;
      (trigger?.isConnected ? trigger : canvasHost.current?.querySelector('canvas'))?.focus();
    });
  };
  const runCamera = (command: CameraCommand) => {
    if (command.type === 'home') { setSelection({ zoneId: null, entityId: null }); setInspectionOpen(false); }
    commands.current?.run(command);
  };

  useEffect(() => {
    const resize = () => setCompact(window.innerWidth <= 700);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const releaseKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!heldCameraKeys.current.delete(key)) return;
      setKeyboardPanning(heldCameraKeys.current.size > 0);
    };
    const releaseAll = () => {
      heldCameraKeys.current.clear();
      setKeyboardPanning(false);
    };
    window.addEventListener('keyup', releaseKey);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keyup', releaseKey);
      window.removeEventListener('blur', releaseAll);
    };
  }, []);

  useEffect(() => bindClockToDocument(demoClock), []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && inspectionOpen) closeInspection();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [inspectionOpen]);

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      if (options.current?.open && event.target instanceof Node && !options.current.contains(event.target)) {
        options.current.open = false;
      }
    }
    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && options.current?.open) {
        options.current.open = false;
        options.current.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissWithEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissWithEscape);
    };
  }, []);

  return <div className="app-shell">
    <header className="topbar">
      <div className="identity"><span className="brand">Assembly<span className="brand-period">.</span></span>
        <span className="title-divider" /><h1>Aircraft campus</h1></div>
      <div className="view-identity" aria-label="Current view: static A-100 assembly sequence">
        <span className="eyebrow">08 / PEOPLE IN MOTION</span>
        <strong>A-100 assembly sequence</strong>
      </div>
      <div className="top-actions"><span className="demo-badge">Demo</span>
        <details ref={options} className="options-menu" onToggle={event => {
          if (event.currentTarget.open) setHelp(false);
        }}>
          <summary>Options <span className="chevron" aria-hidden="true" /></summary>
          <div className="options-panel">
            <span className="eyebrow">DISPLAY LAYERS</span>
            <label><span>Buildings</span><input type="checkbox" aria-label="Buildings" checked={showBuildings}
              onChange={event => setShowBuildings(event.target.checked)} /></label>
            <label className={!showBuildings ? 'disabled-layer' : ''}><span>Roofs</span>
              <input type="checkbox" aria-label="Roofs" checked={roofs} disabled={!showBuildings}
                onChange={event => setRoofs(event.target.checked)} /></label>
            <label className={!showBuildings ? 'disabled-layer' : ''}><span>Overhead beams</span>
              <input type="checkbox" aria-label="Overhead beams" checked={showBeams} disabled={!showBuildings}
                onChange={event => setShowBeams(event.target.checked)} /></label>
            <p>Hide roofs to look inside.</p>
            <button className="aircraft-view" onClick={() => {
              setRoofs(false);
              selectZone('bay-5');
              if (options.current) options.current.open = false;
            }}>Aircraft close-up</button>
          </div>
        </details>
        <button aria-expanded={help} aria-controls="camera-help" onClick={() => setHelp(!help)}>Camera help</button>
      </div>
    </header>
    <main className="viewer" aria-label="Aircraft campus viewer">
      <ProcessList open={processOpen} onToggle={() => setProcessOpen(!processOpen)}
        selectedZoneId={selectedZoneId} onSelectZone={selectZone} />
      <div ref={canvasHost} className="canvas-host" onContextMenu={event => event.preventDefault()}
        onPointerDownCapture={event => { gesture.current = { x: event.clientX, y: event.clientY, distance: 0 }; }}
        onPointerMoveCapture={event => {
          gesture.current.distance = Math.max(gesture.current.distance,
            Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y));
        }}
        onKeyDown={event => {
          if (!(event.target instanceof HTMLCanvasElement)) return;
          const command = cameraCommandForKey(event.key);
          if (!command) return;
          event.preventDefault();
          if (command.type === 'keyboard-pan') {
            heldCameraKeys.current.add(command.key);
            setKeyboardPanning(true);
          } else runCamera(command);
        }}>
        <SceneBoundary>
          <Canvas shadows dpr={[1, 1.5]} frameloop={playback.playing || keyboardPanning ? 'always' : 'demand'}
            onPointerMissed={event => {
              if (isSelectionClick(event.button, gesture.current.distance)) {
                setSelection(current => ({ ...current, entityId: null }));
              }
            }}
            camera={CAMERA_CONFIG}
            gl={{ antialias: true, powerPreference: 'high-performance' }} fallback={null}>
            <color attach="background" args={['#edf1f3']} />
            <hemisphereLight args={['#ffffff', '#a5b0b8', 1.2]} />
            <directionalLight position={[100, 650, 350]} intensity={1.8} castShadow
              shadow-mapSize={[2048, 2048]} shadow-camera-left={-650} shadow-camera-right={650}
              shadow-camera-top={440} shadow-camera-bottom={-440} shadow-camera-far={1600}
              shadow-normalBias={0.7} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.05, 0]} receiveShadow>
              <planeGeometry args={[4000, 4000]} /><meshStandardMaterial color="#edf1f3" roughness={1} />
            </mesh>
            <Campus roofs={roofs} showBuildings={showBuildings} showBeams={showBeams} clearances={clearances}
              selectedZoneId={selectedZoneId} selectedEntityId={selection.entityId} onSelectEntity={id => {
                if (isSelectionClick(0, gesture.current.distance)) selectEntity(id);
              }} />
            <ZoneLabels selectedZoneId={selectedZoneId} onSelectZone={selectZone} />
            <CameraRig commands={commands} panelWidth={processOpen ? 252 : 0}
              rightPanelWidth={inspectionOpen && !compact ? 320 : 0}
              movementKeys={heldCameraKeys.current}
              onManualPan={() => { setSelection({ zoneId: null, entityId: null }); setInspectionOpen(false); }} />
          </Canvas>
        </SceneBoundary>
      </div>
      {inspectionOpen && selectedZone && <Inspector zone={selectedZone} entity={selectedEntity}
        onSelect={selectEntity} onClose={closeInspection} />}
      {help && <aside id="camera-help" className="help-panel" aria-label="Camera instructions">
        <div className="help-title"><h2>Move around the model</h2><button onClick={() => setHelp(false)}>Close</button></div>
        <dl><dt>Orbit</dt><dd>Drag with the left mouse button</dd>
          <dt>Pan</dt><dd>Right-drag or Shift + drag</dd><dt>Zoom</dt><dd>Scroll or use + / −</dd>
          <dt>Keyboard</dt><dd>Focus the model and hold WASD to move relative to the view. Arrow keys pan in steps; Home resets.</dd>
          <dt>Touch</dt><dd>One finger orbits; two fingers pan and zoom.</dd></dl>
      </aside>}
      <div className={`scene-caption${processOpen ? ' with-process' : ''}`}><span className="eyebrow">ILLUSTRATIVE MODEL · DEMO DATA</span>
        <p>{parcel.lengthM.toLocaleString()} m × {parcel.widthM} m campus <span>/</span> 32 m assembly height</p>
        <p className="ruler-note">Teal paths: pedestrian <span>·</span> Amber dashes: aircraft tow</p></div>
      <nav className="camera-toolbar" aria-label="Camera controls">
        <button aria-label="Home view" title="Reset camera" onClick={() => runCamera({ type: 'home' })}>Home</button><span className="toolbar-divider" />
        <button className="zoom-button" aria-label="Zoom in" onClick={() => runCamera({ type: 'move', action: 'in' })}>+</button>
        <button className="zoom-button" aria-label="Zoom out" onClick={() => runCamera({ type: 'move', action: 'out' })}>−</button>
      </nav>
      <Playback />
      <p className="gesture-hint">Drag to orbit <span>·</span> Shift + drag to pan <span>·</span> Scroll to zoom</p>
    </main>
  </div>;
}
