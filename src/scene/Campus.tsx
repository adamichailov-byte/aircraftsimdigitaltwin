import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { CanvasTexture } from 'three';
import { useThree } from '@react-three/fiber';
import { bays, buildings, cargoApron, deliveryStands, flightCheckStand, parcel, rail, tow } from '../demo/campus';
import { Block, Building } from './Building';
import { fixtures } from '../demo/entities';
import { PaintEnclosure, StationFixture } from '../models/StationKit';
import { StationTooling } from '../models/Tooling';
import { LogisticsRoutes } from '../models/LogisticsKit';
import { zones } from '../demo/zones';
import { scenePalette } from '../models/materials';
import { BlockInstances } from '../models/RepeatedBlocks';
import { simulationFixture } from '../simulation/transfers';
import { fleetBuildings } from '../simulation/flow';
import type {FleetClient} from '../simulation/client';
import {StationMotion} from './StationMotion';

function FloorText({ text, at, width = 130, color = scenePalette.floorInk }: { text: string; at: [number, number]; width?: number; color?: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 96;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color;
    context.font = '600 48px Segoe UI, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 512, 48);
    return new CanvasTexture(canvas);
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={[at[0], 0.85, at[1]]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[width, width * 96 / 1024]} />
    <meshBasicMaterial map={texture} transparent depthWrite={false} />
  </mesh>;
}

function Outline({ at, size, color = scenePalette.platformDeck, stroke = 0.45 }: {
  at: [number, number]; size: [number, number]; color?: string; stroke?: number;
}) {
  return <group position={[at[0], 0.78, at[1]]}>
    {[-1, 1].map(side => <group key={side}>
      <Block at={[0, 0, side * size[1] / 2]} size={[size[0], 0.025, stroke]} color={color} shadow={false} />
      <Block at={[side * size[0] / 2, 0, 0]} size={[stroke, 0.025, size[1]]} color={color} shadow={false} />
    </group>)}
  </group>;
}

export function Campus({ roofs, showBuildings, showBeams, clearances, selectedZoneId, fleet = true, children,client }: {
  roofs: boolean; showBuildings: boolean; showBeams: boolean; clearances: boolean;
  selectedZoneId: string | null;
  fleet?: boolean; children?: ReactNode; client?:FleetClient;
}) {
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { invalidate(); }, [roofs, showBuildings, showBeams, clearances, invalidate]);
  return <BlockInstances><group>

    {selectedZoneId && zones.filter(zone => zone.id === selectedZoneId && zone.id !== 'flightline' && zone.id !== 'delivery'
      && zone.focusCenterM && zone.focusSizeM).map(zone => <Outline
      key={`selected-${zone.id}`} at={zone.focusCenterM!} size={[zone.focusSizeM![0] - 12, zone.focusSizeM![1] - 12]}
      color="#286a78" stroke={1.4} />)}
    <Block at={[0, -1.8, 0]} size={[parcel.lengthM, 3, parcel.widthM]} color={scenePalette.siteEdge} />
    <Block at={[0, -0.15, 0]} size={[parcel.lengthM - 8, 0.3, parcel.widthM - 8]} color={scenePalette.ground} />
    {/* Architectural pads remain visible when the building layer is hidden. */}
    {(fleet?fleetBuildings:buildings).map(building => <Block key={building.id}
      at={[building.centerM[0], 0.35, building.centerM[1]]}
      size={[building.lengthM + 8, 0.7, building.widthM + 8]} color={scenePalette.concrete} />)}
    <Block at={[cargoApron.centerM[0], 0.35, cargoApron.centerM[1]]}
      size={[cargoApron.lengthM, 0.7, cargoApron.widthM]} color={scenePalette.apron} />
    <Block at={[-355, 0.35, -345]} size={[340, 0.7, 70]} color={scenePalette.road} />
    <Block at={[-287.5, 0.35, -30]} size={[55, 0.7, 36]} color={scenePalette.concrete} />
    <Block at={[480, 0.35, -273]} size={[14, 0.7, 12]} color={scenePalette.road} />
    <Block at={[305, 0.35, 300]} size={[460, 0.7, 260]} color={scenePalette.apron} />
    {/* A paved taxiway connects the east hangar door to the apron without crossing grass. */}
    <Block at={[220, 0.35, 51]} size={[80, 0.7, 246]} color={scenePalette.apron} />
    {fleet&&<group name="exterior-aircraft-transfer-lane">
      <Block at={[-91.75,0.35,-295]} size={[491.5,0.7,90]} color={scenePalette.apron}/>
      <Block at={[-292.5,0.35,-92.5]} size={[65,0.7,495]} color={scenePalette.apron}/>
      <Block at={[-270,0.35,110]} size={[110,0.7,90]} color={scenePalette.apron}/>
      <Block at={[104,0.745,-272.5]} size={[0.45,0.035,45]} color={scenePalette.marking} shadow={false}/>
      <Block at={[-292.5,0.745,-92.5]} size={[0.45,0.035,405]} color={scenePalette.marking} shadow={false}/>
      <Block at={[-94.25,0.745,-295]} size={[396.5,0.035,0.45]} color={scenePalette.marking} shadow={false}/>
    </group>}
    {/* Taxiway edge markings run parallel to each straight section. */}
    <Block at={[205, 0.745, -58]} size={[50, 0.035, 0.45]} color={scenePalette.marking} shadow={false} />
    <Block at={[205, 0.745, -2]} size={[50, 0.035, 0.45]} color={scenePalette.marking} shadow={false} />
    <Block at={[202, 0.74, 70]} size={[0.45, 0.035, 200]} color={scenePalette.marking} shadow={false} />
    <Block at={[258, 0.74, 70]} size={[0.45, 0.035, 200]} color={scenePalette.marking} shadow={false} />
    {/* Vehicle roads stop outside the aircraft transfer area. */}
    <Block at={[-215, 0.25, 215]} size={[580, 0.5, 16]} color={scenePalette.road} />
    <Block at={[-490, 0.25, -47.5]} size={[16, 0.5, 525]} color={scenePalette.road} />
    <Block at={[5, 0.25, -263]} size={[990, 0.5, 14]} color={scenePalette.road} />
    <Block at={[-472.5, 0.3, -30]} size={[35, 0.5, 12]} color={scenePalette.road} />
    <Block at={[384, 0.3, -155]} size={[28, 0.5, 12]} color={scenePalette.road} />
    <Block at={[391, 0.3, -201]} size={[14, 0.5, 120]} color={scenePalette.road} />
    {Array.from({ length: 30 }, (_, index) => <Block key={index}
      at={[-494 + index * 19, 0.52, 215]} size={[7, 0.03, 0.35]} color="#e2e8eb" shadow={false} />)}
    {Array.from({ length: 50 }, (_, index) => <Block key={index}
      at={[-481 + index * 20, 0.52, -263]} size={[7, 0.03, 0.35]} color="#e2e8eb" shadow={false} />)}
    {/* Pedestrian surfaces are raised and separated from the service roads. */}
    <Block at={[-197.5, 0.45, 200]} size={[545, 0.9, 6]} color={scenePalette.pedestrian} />
    <Block at={[-385, 0.45, 72]} size={[140, 0.9, 6]} color={scenePalette.pedestrian} />
    <Block at={[-280, 0.45, 136]} size={[6, 0.9, 128]} color={scenePalette.pedestrian} />
    <Block at={[-297.5, 0.45, 72]} size={[35, 0.9, 6]} color={scenePalette.pedestrian} />
    {Array.from({ length: 9 }, (_, index) => <Block key={index}
      at={[-455 + index * 2, 0.91, 200]} size={[1, 0.025, 5]} color="#dfebeb" shadow={false} />)}
    {/* Rail alignment and sleepers: scenery only, no transport behavior. */}
    {Array.from({ length: 61 }, (_, index) => <Block key={index}
      at={[rail.startXM + index * 10, 0.78, rail.zM]} size={[1.2, 0.3, 5]} color="#94a0a4" shadow={false} />)}
    {[-1, 1].map(side => <Block key={side} at={[(rail.startXM + rail.endXM) / 2, 1, rail.zM + side * 1.6]}
      size={[rail.endXM - rail.startXM, 0.25, 0.25]} color="#586b76" shadow={false} />)}
    {bays.map(bay => <group key={bay.id}>
      <Outline at={bay.centerM} size={[bay.lengthM, bay.widthM]} />
      <FloorText text={bay.number} at={[bay.centerM[0], bay.centerM[1] + 48]} width={12} />
    </group>)}
    <group name="flight-check-stand">
      <FloorText text="CHECK 01" at={[flightCheckStand[0], flightCheckStand[1] + 40]} width={42} color={scenePalette.apronInk} />
    </group>
    {deliveryStands.map(([xM, zM], index) => <group key={index} name={`delivery-stand-${index + 1}`}>
      <Block at={[xM, 0.78, zM]} size={[0.45, 0.04, 76]} color={scenePalette.marking} shadow={false} />
      <FloorText text={`DELIVERY 0${index + 1}`} at={[xM, zM + 40]} width={54} color={scenePalette.apronInk} />
    </group>)}
    <Block at={[flightCheckStand[0], 0.78, flightCheckStand[1]]}
      size={[0.45, 0.04, 76]} color={scenePalette.marking} shadow={false} />
    <Outline at={cargoApron.centerM} size={[cargoApron.lengthM - 12, cargoApron.widthM - 12]} color="#dce6e7" />
    <LogisticsRoutes />
    <FloorText text="FINAL ASSEMBLY" at={[-40, 232]} width={145} />
    <FloorText text="RECEIVING / KITTING" at={[-385, 86]} width={120} />
    <FloorText text="PARTS / INVENTORY" at={[300, -83]} width={125} />
    <FloorText text="CARGO APRON" at={[330, -288]} width={125} />
    <FloorText text="RAIL RECEIVING" at={[-355, -302]} width={140} />
    <FloorText text="FLIGHT-LINE CHECKS" at={[flightCheckStand[0], 344]} width={110} color={scenePalette.apronInk} />
    <FloorText text="CUSTOMER DELIVERY" at={[420, 425]} width={116} color={scenePalette.apronInk} />
    {bays.map(bay => <FloorText key={bay.id} text={`BAY ${bay.number}`}
      at={[bay.centerM[0], bay.centerM[1] + 52]} width={34} />)}
    <FloorText text="PAINT" at={[104, 17]} width={28} />
    <Block at={[-140, 0.79, 244]} size={[60, 0.08, 0.55]} color="#286a78" shadow={false} />
    {Array.from({ length: 7 }, (_, index) => <Block key={index}
      at={[-170 + index * 10, 0.79, 244]} size={[0.55, 0.08, 3]} color="#286a78" shadow={false} />)}
    {showBuildings && (fleet?fleetBuildings:buildings).map(spec => <Building key={spec.id} spec={spec} roofs={roofs} showBeams={showBeams} />)}
    {showBuildings && <PaintEnclosure roofs={roofs} doorsOpen={fleet} />}
    {fixtures.filter(fixture => fixture.id !== 'receiving-pallet-c'
      && (!fleet || fixture.kind!=='rack' || fixture.zoneId!=='stores')
      && (showBuildings || !['receiving', 'stores'].includes(fixture.zoneId)))
      .map(fixture => <StationFixture key={fixture.id} fixture={fleet ? simulationFixture(fixture) : fixture} fullness={fleet&&fixture.zoneId==='receiving'?0:undefined} />)}
    {children}
    {fleet&&client&&<StationMotion client={client}/>}
    {showBuildings && <StationTooling perimeterClearance={fleet} />}
    {clearances && <group>
      {bays.map(bay => <mesh key={bay.id} position={[bay.centerM[0], 9.2, bay.centerM[1]]}>
        <boxGeometry args={[60, 17, 60]} /><meshBasicMaterial color="#286a78" wireframe />
      </mesh>)}
      <mesh position={[tow.eastLaneXM, 9.2, tow.turningZM]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[60, 17, 60]} /><meshBasicMaterial color="#9f752e" wireframe />
      </mesh>
    </group>}
  </group></BlockInstances>;
}
