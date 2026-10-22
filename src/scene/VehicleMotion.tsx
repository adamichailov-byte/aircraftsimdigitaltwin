import { useEffect,useRef,useSyncExternalStore } from 'react';
import { useFrame,useThree } from '@react-three/fiber';
import {Html} from '@react-three/drei';
import type {FleetClient} from '../simulation/client';
import {handlingPose,handlingRoute} from '../simulation/logistics';
import {fixtures,isSelectionClick,transportEntities} from '../demo/entities';
import {StationFixture} from '../models/StationKit';
import type { Group } from 'three';
import type { InspectableEntity } from '../demo/entities';
import { demoClock } from '../demo/clock';
import { MATERIAL_TIME_COMPRESSION, motionPlans, vehicleActionAt, vehiclePayloadPoseAt } from '../demo/vehicle-actions';
import { Block } from './Building';
import { Selectable } from './Selectable';
import { CargoFreighter, GroundSupport, RailConsist } from '../models/TransportKit';
import { ReceivingHandling } from '../models/LogisticsKit';
import { cargoUnloadingPoseAt } from '../demo/vehicle-actions';

function CarrierModel({ entity }: { entity: InspectableEntity }) {
  if (entity.id === 'cargo-freighter') return <CargoFreighter />;
  if (entity.id === 'inbound-train') return <RailConsist />;
  if (entity.id === 'receiving-wing-stand' || entity.id === 'receiving-engine-stand') {
    return <ReceivingHandling entity={entity} />;
  }
  return <GroundSupport entity={entity} />;
}

function ForkliftPallet() {
  return <group>
    <Block at={[0, 0.15, 0]} size={[6.4, 0.3, 4.4]} color="#65777b" />
    {[-2.4, 0, 2.4].map(x => <Block key={x} at={[x, 0.38, 0]} size={[0.16, 0.16, 4.1]} color="#b39a59" />)}
    <Block at={[0, 1.85, 0]} size={[4.8, 2.65, 3.35]} color="#a6b1ad" />
    <Block at={[0, 3.22, 0]} size={[4.95, 0.12, 3.5]} color="#586c72" shadow={false} />
    {[-1, 1].map(side => <Block key={side} at={[side * 1.55, 1.85, 1.7]}
      size={[0.13, 2.45, 0.08]} color="#c0aa64" shadow={false} />)}
  </group>;
}

function TowCartLoad() {
  return <group>
    {[-4.2, 0].map(x => <group key={x}>
      <Block at={[x, 0.9, 0]} size={[3.8, 0.24, 3.1]} color="#536970" />
      <Block at={[x, 1.85, 0]} size={[2.7, 1.7, 2.5]} color="#b1b8b3" />
      <Block at={[x, 2.74, 0]} size={[2.85, 0.12, 2.64]} color="#c8b36f" shadow={false} />
      {[-1, 1].flatMap(side => [-1, 1].map(end => <mesh key={`${side}-${end}`}
        position={[x + end * 1.25, 0.48, side * 1.15]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.28, 12]} /><meshStandardMaterial color="#34454b" roughness={0.95} />
      </mesh>))}
    </group>)}
  </group>;
}

export function VehicleMotion({ entity, selected, onSelect }: {
  entity: InspectableEntity; selected: boolean; onSelect: (id: string) => void;
}) {
  const actor = useRef<Group>(null);
  const load = useRef<Group>(null);
  const action = motionPlans.find(candidate => candidate.entityId === entity.id);
  const localEntity = { ...entity, positionM: [0, 0.7, 0] as [number, number, number] };

  useFrame(() => {
    const base = entity.positionM;
    const pose = action ? vehicleActionAt(action, demoClock.getElapsedSeconds() * MATERIAL_TIME_COMPRESSION) : {
      positionM: [base[0], base[2]] as [number, number], heading: 0,
      phase: 'complete' as const, carrying: false, delivered: false,
    };
    if (actor.current) {
      actor.current.position.set(pose.positionM[0], 0, pose.positionM[1]);
      actor.current.rotation.y = pose.heading;
    }
    if (action?.payloadStartM && load.current) {
      const payload = vehiclePayloadPoseAt(action, pose, base[1]);
      if (payload) {
        load.current.position.set(payload[0], payload[1], payload[2]);
        load.current.rotation.y = pose.carrying ? pose.heading : 0;
      }
    }
  });

  return <group name={`motion-${entity.id}`}>
    <group ref={actor}>
      <Selectable entity={localEntity} selected={selected} onSelect={onSelect}>
        <group position={[0, 0.7, 0]}><CarrierModel entity={entity} /></group>
      </Selectable>
    </group>
    {action?.payloadStartM && <group ref={load} name={`load-${entity.id}`}>
      {entity.id === 'rail-forklift' ? <ForkliftPallet /> : <TowCartLoad />}
    </group>}
  </group>;
}

export function CargoUnloading() {
  const load = useRef<Group>(null);
  useFrame(() => {
    if (!load.current) return;
    const pose = cargoUnloadingPoseAt(demoClock.getElapsedSeconds() * MATERIAL_TIME_COMPRESSION);
    load.current.position.set(pose.xM, pose.yM, pose.zM);
    load.current.rotation.y = pose.heading;
  });
  return <group ref={load} name="freighter-cargo-load">
    <Block at={[0, 0, 0]} size={[6.4, 2.1, 4.2]} color="#8b9c9c" />
    <Block at={[0, 1.1, 0]} size={[6.55, 0.12, 4.35]} color="#526970" shadow={false} />
    {[-1, 1].map(side => <Block key={side} at={[side * 2.15, 0.04, 0]}
      size={[0.12, 2, 4.24]} color="#b39a59" shadow={false} />)}
  </group>;
}

/** Fleet mode mounts only this causal carrier, never the legacy delivery loops. */
export function SimulationLogistics({client,onSelectJob}:{client:FleetClient;onSelectJob:(id:string)=>void}){
  const {displayFleet:fleet}=useSyncExternalStore(client.subscribe,client.getSnapshot);
  const actor=useRef<Group>(null),payload=useRef<Group>(null),invalidate=useThree(s=>s.invalidate);
  useEffect(()=>client.subscribe(invalidate),[client,invalidate]);
  const job=fleet?.logistics.jobs.find(j=>j.id===fleet.logistics.carrierId);
  const inspect=fleet?.logistics.jobs.find(j=>j.state==='working'&&['inspection','kitting'].includes(j.stage));
  const processingCrew=fleet?.logistics.jobs.filter(j=>j.state==='working'&&['inspection','kitting'].includes(j.stage)).reduce((n,j)=>n+j.crewCount,0)??0;
  const dock=job?.stage==='loading'?undefined:fleet?.logistics.jobs.find(j=>j.id!==job?.id&&['inspection','kitting','loading','held'].includes(j.stage));
  const selection=job?.id??inspect?.id??fleet?.logistics.jobs.find(j=>j.stage!=='complete')?.id??'';
  useFrame(()=>{
    const view=client.getSnapshot(),live=view.displayFleet,current=live?.logistics.jobs.find(j=>j.id===live.logistics.carrierId);
    const time=live?view.history.cursor===null?Math.max(live.instant,Math.min(client.clock.getInstant(),live.nextEventInstant??live.instant)):live.instant:0;
    const pose=current?handlingPose(current,time):{positionM:[handlingRoute[0][0],0.7,handlingRoute[0][1]] as [number,number,number],heading:Math.PI,carrying:false,progress:0};
    if(actor.current){actor.current.position.set(...pose.positionM);actor.current.rotation.y=pose.heading;}
    if(payload.current){payload.current.visible=pose.carrying;
      payload.current.position.y=current?.stage==='loading'?pose.progress*0.8:current?.stage==='unloading'?(1-pose.progress)*0.8:0.8;}
  });
  const stock=fleet?.inventory.lots??[];
  return <group name="causal-receiving-logistics">
    <group ref={actor} position={[-450,0.7,-30]} rotation={[0,Math.PI,0]} onClick={e=>{e.stopPropagation();if(isSelectionClick(e.button,e.delta))onSelectJob(selection);}}>
      <GroundSupport entity={transportEntities.find(e=>e.id==='rail-forklift')!}/>
      {job?.state==='working'&&<group name="assigned-forklift-driver" position={[-0.6,1.3,0]}>
        <Block at={[0,0.4,0]} size={[0.45,0.6,0.35]} color="#c89935"/><mesh position={[0,0.95,0]}><sphereGeometry args={[0.18,8,6]}/><meshStandardMaterial color="#b99e88"/></mesh>
      </group>}
      <group ref={payload} visible={!!job} position={[4.2,0.8,0]}><ForkliftPallet/></group>
      {fleet&&(job||!dock)&&<Html position={[0,7,0]} center zIndexRange={[1,1]}><button className={`handling-marker${job?.state==='paused'?' is-warning':''}`} onClick={e=>{e.stopPropagation();onSelectJob(selection);}}
        aria-label={`Inspect receiving kit forklift: ${job?`${job.id}, ${job.stage}, ${job.state}`:'standby'}`}>
        <span aria-hidden="true">↳</span> {job?`${job.stage} · ${job.state}`:'Kit forklift'}</button></Html>}
    </group>
    {dock&&<group position={[-454.2,0.7,-30]} rotation={[0,Math.PI,0]} name={`dock-load-${dock.id}`}
      onClick={e=>{e.stopPropagation();if(isSelectionClick(e.button,e.delta))onSelectJob(dock.id);}}><ForkliftPallet/>
      <Html position={[0,5.5,0]} center zIndexRange={[1,1]}><button className={`handling-marker${dock.state==='waiting'||dock.state==='held'?' is-warning':''}`} onClick={e=>{e.stopPropagation();onSelectJob(dock.id);}}>Kit · {dock.stage}</button></Html>
    </group>}
    {processingCrew>0&&<group position={[-441,0.7,-42]} name="assigned-receiving-crew">{Array.from({length:processingCrew},(_,i)=><group key={i} position={[0,0,i*3]}>
      <Block at={[0,0.5,0]} size={[0.35,1,0.3]} color="#344653"/><Block at={[0,1.2,0]} size={[0.6,0.6,0.35]} color="#c89935"/>
      <mesh position={[0,1.7,0]}><sphereGeometry args={[0.18,8,6]}/><meshStandardMaterial color="#b99e88"/></mesh>
    </group>)}</group>}
    {fixtures.filter(f=>f.kind==='rack'&&f.zoneId==='stores').map(f=>{
      const skus=f.id==='stores-rack-east'?['engine']:f.id==='stores-rack-west'?['major-section-kit','wing-pair-kit','tail-kit','gear-kit']
        :f.id==='stores-rack-centre'?['join-kit','electrical-kit','hydraulic-kit','cabin-services-kit','cabin-interior-kit','coating-kit']:[];
      const lots=stock.filter(l=>skus.includes(l.sku)),available=lots.reduce((n,l)=>n+l.available,0);
      const buffer=f.id==='stores-rack-east'?8:skus.length*4;
      return <group key={f.id}><StationFixture fixture={f} fullness={buffer?available/buffer:0}/></group>;
    })}
  </group>;
}
