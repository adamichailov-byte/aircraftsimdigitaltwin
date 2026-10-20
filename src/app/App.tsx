import {Component,useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {ReactNode} from 'react';
import {Canvas} from '@react-three/fiber';
import {Campus} from '../scene/Campus';
import {homePositionM,parcel} from '../demo/campus';
import {ProcessList} from '../ui/ProcessList';
import {CameraRig,type CameraCommand,type CameraCommandHandle} from '../scene/CameraRig';
import {ZoneLabels} from '../scene/ZoneLabels';
import {isSelectionClick} from '../demo/entities';
import {cameraCommandForKey} from '../scene/camera-keyboard';
import {tourCommandForKey,tourStops} from '../demo/tour';
import {Tour} from '../ui/Tour';
import {daylight,scenePalette} from '../models/materials';
import {FleetClient} from '../simulation/client';
import {fleetFixture} from '../simulation/flow';
import {fleetPose} from '../simulation/selectors';
import {FleetControls,FleetInspector} from '../ui/FleetPanel';
import {SimulationAircraft} from '../scene/SimulationAircraft';
import {RenderDiagnostics} from '../scene/RenderDiagnostics';
import {SimulationLogistics} from '../scene/VehicleMotion';
import {LogisticsInspector} from '../ui/Materials';
import {handlingPose} from '../simulation/logistics';
import {MasterSchedule} from '../ui/MasterSchedule';
import {History} from '../ui/History';
import {FlowTimeline} from '../ui/FlowTimeline';

const CAMERA_CONFIG={position:homePositionM,fov:40,near:0.5,far:5000};
function RendererUnavailable(){return <div className="renderer-error" role="alert"><h2>The 3D view couldn’t open</h2><p>This viewer needs WebGL2. Enable hardware acceleration and reload.</p><button onClick={()=>window.location.reload()}>Reload viewer</button></div>;}
class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<RendererUnavailable/>:this.props.children;}
}

export function App(){
  const [client]=useState(()=>new FleetClient(fleetFixture()));
  const commands=useRef<CameraCommandHandle|null>(null),canvasHost=useRef<HTMLDivElement>(null);
  const options=useRef<HTMLDetailsElement>(null),heldCameraKeys=useRef(new Set<string>());
  const gesture=useRef({x:0,y:0,distance:0});
  const [help,setHelp]=useState(false),[roofs,setRoofs]=useState(false),[showBuildings,setShowBuildings]=useState(true),[showBeams,setShowBeams]=useState(true);
  const [reducedQuality,setReducedQuality]=useState(false),[processOpen,setProcessOpen]=useState(()=>innerWidth>1024),[compact,setCompact]=useState(()=>innerWidth<=700);
  const [selectedId,setSelectedId]=useState<string|null>(null),[selectedZone,setSelectedZone]=useState<string|null>(null);
  const [selectedJobId,setSelectedJobId]=useState<string|null>(null);
  const [inspectionOpen,setInspectionOpen]=useState(true),[keyboardPanning,setKeyboardPanning]=useState(false),[tourIndex,setTourIndex]=useState<number|null>(null);
  const [historyOpen,setHistoryOpen]=useState(false);
  useEffect(()=>{client.start();return()=>client.dispose();},[client]);
  const playing=useSyncExternalStore(client.clock.subscribe,()=>client.clock.getSnapshot().playing);
  // Commit each selected historical snapshot as one shared scene/inspector state.
  useSyncExternalStore(client.subscribe,()=>{const view=client.getSnapshot(),fleet=view.displayFleet;
    return `${view.runId}/${view.history.cursor??'live'}/${fleet?.revision??''}/${fleet?.instant??''}/${fleet?.aircraft.map(a=>`${a.id}:${a.slot}:${a.state}`).join('|')??''}`;});
  const fleet=client.getSnapshot().displayFleet;
  const selected=fleet?.aircraft.find(a=>a.id===selectedId)??(selectedZone?fleet?.aircraft.find(a=>a.state!=='delivered'&&fleetPose(client.config,fleet,a).zoneId===selectedZone):fleet?.aircraft.find(a=>a.state!=='delivered'));
  const zoneId=selectedJobId!==null?null:fleet&&selected?fleetPose(client.config,fleet,selected).zoneId:selectedZone;
  const resolvePose=useCallback((id:string)=>{const view=client.getSnapshot(),snapshot=view.displayFleet,a=snapshot?.aircraft.find(a=>a.id===id);
    if(id==='kit-forklift'){const job=snapshot?.logistics.jobs.find(j=>j.id===snapshot.logistics.carrierId);
      return job?handlingPose(job,view.history.cursor===null?Math.min(client.clock.getInstant(),snapshot!.nextEventInstant??snapshot!.instant):snapshot!.instant).positionM:[-450,0.7,-30] as [number,number,number];}
    return snapshot&&a?fleetPose(client.config,snapshot,a,view.history.cursor===null?client.clock.getInstant():snapshot.instant).positionM:null;},[client]);
  const follow=(id:string)=>{
    const snapshot=client.getSnapshot().displayFleet,a=snapshot?.aircraft.find(a=>a.id===id);if(!snapshot||!a)return;
    const pose=fleetPose(client.config,snapshot,a);
    setSelectedId(id);setSelectedZone(null);setInspectionOpen(true);setRoofs(false);
    setSelectedJobId(null);
    if(!pose.visible)return;
    if(innerWidth<=1024)setProcessOpen(false);
    commands.current?.run({type:'track',entityId:id,positionM:pose.positionM,sizeM:[64,18,55]});
  };
  const openLogistics=(id='',track=false)=>{setSelectedJobId(id);setSelectedZone(null);setInspectionOpen(true);setRoofs(false);
    if(innerWidth<=1024)setProcessOpen(false);
    if(track)commands.current?.run({type:'track',entityId:'kit-forklift',positionM:resolvePose('kit-forklift')??[-450,0.7,-30],sizeM:[24,12,18]});};
  const selectZone=(id:string)=>{setSelectedJobId(null);setSelectedId(null);setSelectedZone(id);setInspectionOpen(true);setRoofs(false);
    if(innerWidth<=1024)setProcessOpen(false);commands.current?.run({type:'focus',zoneId:id});};
  const resetSelection=()=>{setSelectedJobId(null);setSelectedId(null);setSelectedZone(null);setTourIndex(null);setHistoryOpen(false);setInspectionOpen(true);commands.current?.run({type:'home'});};
  const runCamera=(command:CameraCommand)=>{if(command.type==='home'){setSelectedJobId(null);setSelectedId(null);setSelectedZone(null);setInspectionOpen(false);}commands.current?.run(command);};
  const closeInspection=()=>{setHistoryOpen(false);setInspectionOpen(false);requestAnimationFrame(()=>canvasHost.current?.querySelector('canvas')?.focus());};
  const focusTour=(index:number)=>{const stop=tourStops[index];if(!stop){setTourIndex(null);return;}
    setSelectedJobId(null);setTourIndex(index);setSelectedId(null);setSelectedZone(stop.zoneId);setInspectionOpen(false);setRoofs(false);commands.current?.run({type:'focus',zoneId:stop.zoneId});};
  useEffect(()=>{
    const resize=()=>{setCompact(innerWidth<=700);if(innerWidth<=1024)setProcessOpen(false);};
    const release=(event:KeyboardEvent)=>{heldCameraKeys.current.delete(event.key.toLowerCase());setKeyboardPanning(heldCameraKeys.current.size>0);};
    const releaseAll=()=>{heldCameraKeys.current.clear();setKeyboardPanning(false);};
    window.addEventListener('resize',resize);window.addEventListener('keyup',release);window.addEventListener('blur',releaseAll);
    return()=>{window.removeEventListener('resize',resize);window.removeEventListener('keyup',release);window.removeEventListener('blur',releaseAll);};
  },[]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(options.current?.open&&event.target instanceof Node&&!options.current.contains(event.target))options.current.open=false;};
    const key=(event:KeyboardEvent)=>{
      if(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement||event.target instanceof HTMLTextAreaElement)return;
      if(tourIndex!==null){const command=tourCommandForKey(event.key);if(command){event.preventDefault();event.stopImmediatePropagation();if(command==='exit')setTourIndex(null);else focusTour(Math.max(0,tourIndex+(command==='next'?1:-1)));return;}}
      if(event.key==='Escape'){if(options.current?.open)options.current.open=false;else if(inspectionOpen)closeInspection();}
    };
    document.addEventListener('pointerdown',outside);window.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',key,true);};
  },[tourIndex,inspectionOpen]);

  return <div className="app-shell">
    <header className="topbar"><div className="identity"><span className="brand">Assembly<span className="brand-period">.</span></span><span className="title-divider"/><h1>Aircraft campus</h1></div>
      <div className="view-identity"><span className="eyebrow">AIRCRAFT PLANT · FINITE-CAPACITY SIMULATION</span><strong>One plant · persistent aircraft · real queues</strong></div>
      <div className="top-actions"><span className="demo-badge">Demo</span><button onClick={()=>focusTour(0)}>Guided tour</button>
        <details ref={options} className="options-menu"><summary>Options <span className="chevron" aria-hidden="true"/></summary><div className="options-panel"><span className="eyebrow">DISPLAY LAYERS</span>
          <label><span>Buildings</span><input type="checkbox" aria-label="Buildings" checked={showBuildings} onChange={e=>setShowBuildings(e.target.checked)}/></label>
          <label><span>Roofs</span><input type="checkbox" aria-label="Roofs" checked={roofs} disabled={!showBuildings} onChange={e=>setRoofs(e.target.checked)}/></label>
          <label><span>Overhead beams</span><input type="checkbox" aria-label="Overhead beams" checked={showBeams} disabled={!showBuildings} onChange={e=>setShowBeams(e.target.checked)}/></label>
          <label><span>Reduced quality</span><input type="checkbox" aria-label="Reduced quality" checked={reducedQuality} onChange={e=>setReducedQuality(e.target.checked)}/></label>
          <p>Hide roofs to look inside. Reduced quality lowers rendering load.</p><button className="aircraft-view" onClick={()=>{if(selected)follow(selected.id);if(options.current)options.current.open=false;}}>Aircraft close-up</button>
        </div></details><button aria-expanded={help} onClick={()=>setHelp(!help)}>Camera help</button>
      </div></header>
    <FleetControls client={client} onReset={resetSelection} onLogistics={()=>openLogistics()} historyOpen={historyOpen} onHistory={()=>{setHistoryOpen(true);setSelectedJobId(null);setInspectionOpen(true);setProcessOpen(false);}}/>
    <main className={`viewer is-task-pilot${inspectionOpen?' pilot-inspection-open':''}`} aria-label="Aircraft campus viewer">
      <ProcessList open={processOpen} onToggle={()=>setProcessOpen(!processOpen)} selectedZoneId={zoneId} onSelectZone={selectZone}/>
      <div className="canvas-host" ref={canvasHost} onContextMenu={e=>e.preventDefault()}
        onPointerDownCapture={e=>{gesture.current={x:e.clientX,y:e.clientY,distance:0};}}
        onPointerMoveCapture={e=>{gesture.current.distance=Math.max(gesture.current.distance,Math.hypot(e.clientX-gesture.current.x,e.clientY-gesture.current.y));}}
        onKeyDown={e=>{if(!(e.target instanceof HTMLCanvasElement))return;const command=cameraCommandForKey(e.key);if(!command)return;e.preventDefault();
          if(command.type==='keyboard-pan'){heldCameraKeys.current.add(command.key);setKeyboardPanning(true);}else runCamera(command);}}>
        <SceneBoundary><Canvas shadows={!reducedQuality} dpr={reducedQuality?0.7:[1,1.5]} frameloop={playing||keyboardPanning?'always':'demand'} camera={CAMERA_CONFIG}
          gl={{antialias:true,powerPreference:'high-performance'}} fallback={null}>
          <color attach="background" args={[scenePalette.background]}/><hemisphereLight args={[daylight.sky,daylight.ground,daylight.fill]}/>
          <directionalLight position={[100,650,350]} intensity={daylight.sun} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-650} shadow-camera-right={650} shadow-camera-top={440} shadow-camera-bottom={-440} shadow-camera-far={1600} shadow-normalBias={0.7}/>
          <mesh rotation={[-Math.PI/2,0,0]} position={[0,-3.05,0]} receiveShadow><planeGeometry args={[4000,4000]}/><meshStandardMaterial color={scenePalette.backdrop} roughness={1}/></mesh>
          <Campus fleet client={client} roofs={roofs} showBuildings={showBuildings} showBeams={showBeams} clearances={new URLSearchParams(location.search).has('clearance')} selectedZoneId={zoneId}>
            <SimulationAircraft client={client} onSelect={id=>{if(isSelectionClick(0,gesture.current.distance))follow(id);}}/>
            <SimulationLogistics client={client} onSelectJob={id=>openLogistics(id,true)} showLabels={selectedJobId!==null}/>
          </Campus>
          <ZoneLabels selectedZoneId={zoneId} onSelectZone={selectZone}/>
          {new URLSearchParams(location.search).has('profile')&&<RenderDiagnostics onFreeze={()=>client.cancel()} contextLabel={`${client.config.name}; ${fleet?.instant}; ${fleet?.wip} WIP`}/>}
          <CameraRig commands={commands} panelWidth={processOpen?252:0} rightPanelWidth={inspectionOpen&&!compact?320:0} movementKeys={heldCameraKeys.current} resolveEntityPose={resolvePose} onManualPan={()=>setSelectedZone(null)}/>
        </Canvas></SceneBoundary>
      </div>
      {historyOpen&&inspectionOpen&&<History client={client} onClose={()=>{setHistoryOpen(false);closeInspection();}} onSelectAircraft={id=>{setSelectedId(id);setSelectedZone(null);setSelectedJobId(null);setInspectionOpen(true);follow(id);}}/>}
      {inspectionOpen&&!historyOpen?(selectedJobId!==null?<LogisticsInspector client={client} selectedId={selectedJobId} onSelect={setSelectedJobId} onClose={closeInspection} onFollow={id=>openLogistics(id,true)} onAircraft={follow}/>
        :<FleetInspector client={client} selectedId={selectedId} zoneId={selectedZone} onSelect={id=>{setSelectedId(id);setSelectedZone(null);}} onClose={closeInspection} onFocus={follow}/>)
        :<button className="pilot-reopen" onClick={()=>setInspectionOpen(true)}>{selectedJobId!==null?'Receiving':'Aircraft tasks'}</button>}
      <Tour index={tourIndex} onBack={()=>focusTour(Math.max(0,(tourIndex??0)-1))} onNext={()=>focusTour((tourIndex??0)+1)} onExit={()=>setTourIndex(null)}/>
      {help&&<aside className="help-panel" aria-label="Camera instructions"><div className="help-title"><h2>Move around the model</h2><button onClick={()=>setHelp(false)}>Close</button></div>
        <dl><dt>Orbit</dt><dd>Left-drag</dd><dt>Pan</dt><dd>Right-drag or Shift + drag</dd><dt>Zoom</dt><dd>Scroll or + / −</dd><dt>Keyboard</dt><dd>Focus the model and hold WASD. Arrow keys pan; Home resets.</dd><dt>Follow</dt><dd>Select an aircraft, then Follow. Any camera input releases tracking.</dd></dl></aside>}
      <div className={`scene-caption${processOpen?' with-process':''}`}><span className="eyebrow">SYNTHETIC FACTORY · ASSUMPTIONS V1</span><p>{parcel.lengthM.toLocaleString()}m × {parcel.widthM}m campus · finite materials, crews and equipment</p></div>
      <nav className="camera-toolbar" aria-label="Camera controls"><button aria-label="Home view" onClick={()=>runCamera({type:'home'})}>Home</button><span className="toolbar-divider"/><button className="zoom-button" aria-label="Zoom in" onClick={()=>runCamera({type:'move',action:'in'})}>+</button><button className="zoom-button" aria-label="Zoom out" onClick={()=>runCamera({type:'move',action:'out'})}>−</button></nav>
      <p className="gesture-hint">Drag to orbit · Shift + drag to pan · Scroll to zoom</p>
    </main>
    <FlowTimeline client={client} selectedId={selectedId} onAircraft={follow}/>
    <MasterSchedule client={client} onOpen={()=>{setHistoryOpen(false);setInspectionOpen(false);setProcessOpen(false);}}
      onAircraft={id=>{setSelectedId(id);setSelectedZone(null);setSelectedJobId(null);setInspectionOpen(true);follow(id);}} onReceipt={id=>openLogistics(id)}/>
  </div>;
}
