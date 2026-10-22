import {useMemo,useRef,useSyncExternalStore} from 'react';
import {useFrame} from '@react-three/fiber';
import {Vector3} from 'three';
import type {Group} from 'three';
import {Block} from './Building';
import {StationFixture} from '../models/StationKit';
import {scenePalette} from '../models/materials';
import {workcellLayout as cells} from './workcell-layout';
import {stationPresentation} from '../simulation/station-presentation';
import type {FleetClient} from '../simulation/client';

function Workcell({cell,client,reducedQuality}:{cell:typeof cells[number];client:FleetClient;reducedQuality:boolean}){
  const {displayFleet}=useSyncExternalStore(client.subscribe,client.getSnapshot);
  const state=stationPresentation(displayFleet,cell.id),detail=useRef<Group>(null),point=useMemo(()=>new Vector3(cell.x,0.7,cell.z),[cell]);
  useFrame(({camera})=>{if(detail.current)detail.current.visible=!reducedQuality&&camera.position.distanceTo(point)<260;});
  return <group name={`operational-${cell.id}`}>
    {cell.racks.map(rack=><StationFixture key={rack.id} fixture={rack} fullness={state.kitInUse?0.34:0}/>)}
    <group position={[cell.x,0.7,cell.z]}>
      {Array.from({length:Math.min(10,state.crewCount)},(_,i)=><group key={i} name="assigned-station-technician" position={[-13+i*2.8,0,-4]}>
        {[-0.12,0.12].map(x=><Block key={x} at={[x,0.38,0]} size={[0.17,0.76,0.2]} color="#344653"/>)}
        <Block at={[0,1.08,0]} size={[0.48,0.64,0.28]} color={scenePalette.equipment}/>
        <Block at={[0,1.51,0]} size={[0.3,0.3,0.28]} color="#ba9f87"/>
        <Block at={[0,1.7,0]} size={[0.39,0.13,0.36]} color="#e3e3cb"/>
      </group>)}
      {/* Only three representative service points; all boxes share campus instance batches. */}
      {['bay-2','bay-4','paint'].includes(cell.id)&&<group>
        <Block at={[19,6.5,0]} size={[0.18,13,0.18]} color={scenePalette.steel}/>
        <Block at={[16,12.9,0]} size={[6,0.18,0.18]} color={scenePalette.steel}/>
        <Block at={[13,11,0]} size={[0.1,4,0.1]} color={scenePalette.equipment}/>
        <group ref={detail}>
          <Block at={[13,8.9,0]} size={[1.3,0.18,0.8]} color={state.crewCount?'#e0dec0':scenePalette.steel} shadow={false}/>
          <Block at={[18,1.1,-0.6]} size={[1.8,1.5,0.9]} color={scenePalette.tooling}/>
          {[0,1,2].map(i=><Block key={i} at={[17.5+i*0.4,1.6,-1.1]} size={[0.13,0.5,0.13]} color={scenePalette.floorInk} shadow={false}/>)}
          <mesh position={[18,2.3,-0.6]} rotation={[0,Math.PI/2,0]}>
            <torusGeometry args={[0.65,0.08,6,16]}/><meshStandardMaterial color={scenePalette.rubber} roughness={0.85}/>
          </mesh>
        </group>
      </group>}
    </group>
  </group>;
}

export function StationWorkcells({client,reducedQuality}:{client:FleetClient;reducedQuality:boolean}){
  return <group name="task-linked-workcells">{cells.map(cell=><Workcell key={cell.id} cell={cell} client={client} reducedQuality={reducedQuality}/>)}</group>;
}
