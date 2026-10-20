import {useEffect,useRef,useSyncExternalStore} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import type {Group} from 'three';
import {Aircraft} from '../models/Aircraft';
import {AircraftTowTug} from '../models/TransportKit';
import {isSelectionClick} from '../demo/entities';
import type {FleetClient} from '../simulation/client';
import {fleetPose} from '../simulation/selectors';
import {aircraftAlert} from '../simulation/alerts';
import {lateAircraftActivities} from '../simulation/schedule';

const origin:[number,number,number]=[0,0,0];
function SerialAircraft({client,id,onSelect}:{client:FleetClient;id:string;onSelect:(id:string)=>void}){
  const group=useRef<Group>(null);
  useSyncExternalStore(client.subscribe,()=>{const view=client.getSnapshot(),a=view.displayFleet?.aircraft.find(a=>a.id===id);
    return `${view.history.cursor??'live'}/${view.displayFleet?.instant??''}/${a?.pilot.aircraft.completedMilestones.join('|')??''}/${a?.state??''}/${a?.reasons.join('|')??''}/${lateAircraftActivities(view.plan,view.displayActual,view.displayFleet?.instant??client.config.recipe.start,id).length}`;});
  const view=client.getSnapshot(),snapshot=view.displayFleet,a=snapshot?.aircraft.find(a=>a.id===id);
  useFrame(()=>{
    const currentView=client.getSnapshot(),live=currentView.displayFleet,aircraft=live?.aircraft.find(a=>a.id===id);
    if(!group.current||!live||!aircraft)return;
    const current=fleetPose(client.config,live,aircraft,currentView.history.cursor===null?client.clock.getInstant():live.instant);
    group.current.position.set(...current.positionM);group.current.rotation.y=current.heading;group.current.visible=current.visible;
  });
  if(!snapshot||!a)return null;
  const pose=fleetPose(client.config,snapshot,a);
  const lateCount=lateAircraftActivities(view.plan,view.displayActual,snapshot.instant,id).length;
  const alert=aircraftAlert(a.reasons,lateCount);
  return <group ref={group} name={`fleet-${id}`} position={pose.positionM} rotation={[0,pose.heading,0]} visible={pose.visible}
    onClick={event=>{event.stopPropagation();if(isSelectionClick(event.button,event.delta))onSelect(id);}}>
    <Aircraft id={id} variant={pose.variant} components={pose.components} positionM={origin}/>
    {a.state==='transferring'&&<group name={`assigned-${snapshot.transfers.find(t=>t.serialId===id)?.tugId}`} position={[27,0,0]} rotation={[0,Math.PI,0]}><AircraftTowTug/></group>}
    {alert&&<Html position={[0,11,0]} center zIndexRange={[1,1]}>
      <button type="button" className={`aircraft-alert-chip is-${alert.kind}`}
        aria-label={`Issue on ${id}: ${alert.label}. ${alert.detail}. Open aircraft details.`}
        title={`${alert.label} · ${alert.detail}`}
        onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()}
        onClick={event=>{event.stopPropagation();onSelect(id);}}>
        <span className="aircraft-alert-icon" aria-hidden="true">!</span><span>{alert.label}</span>
        <span className="aircraft-alert-tooltip" aria-hidden="true">{alert.label} · {alert.detail}</span>
      </button>
    </Html>}
  </group>;
}
export function SimulationAircraft({client,onSelect}:{client:FleetClient;onSelect:(id:string)=>void}){
  const invalidate=useThree(state=>state.invalidate);
  const ids=useSyncExternalStore(client.subscribe,()=>client.getSnapshot().displayFleet?.aircraft.filter(a=>a.state!=='delivered').map(a=>a.id).join('|')??'');
  useEffect(()=>client.subscribe(invalidate),[client,invalidate]);
  return <group name="simulated-fleet">{ids.split('|').filter(Boolean).map(id=><SerialAircraft key={id} id={id} client={client} onSelect={onSelect}/>)}</group>;
}
