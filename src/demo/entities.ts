import type { AircraftVariant } from '../models/aircraft-parts';

export type AircraftEntity = {
  id: string;
  kind: 'aircraft';
  label: string;
  zoneId: string;
  variant: AircraftVariant;
  positionM: [number, number, number];
  rotationY?: number;
};

export type FixtureEntity = {
  id: string;
  kind: 'platform' | 'cart' | 'pallet' | 'rack';
  label: string;
  zoneId: string;
  positionM: [number, number, number];
  sizeM: [number, number, number];
  load?: 'fuselage' | 'wing' | 'supplier-kits';
};

const aircraftAtBay = (id: string, label: string, zoneId: string,
  variant: AircraftVariant, positionM: [number, number]): AircraftEntity => ({
  id, kind: 'aircraft', label, zoneId, variant, positionM: [positionM[0], 0.7, positionM[1]],
});

export const aircraftEntities: AircraftEntity[] = [
  aircraftAtBay('aircraft-join', 'Fuselage sections', 'bay-1', 'sectioned', [-184, -145]),
  aircraftAtBay('aircraft-wing-tail', 'Wing and tail join', 'bay-2', 'bare', [-40, -145]),
  aircraftAtBay('aircraft-systems', 'Systems installation', 'bay-3', 'systems', [104, -145]),
  aircraftAtBay('aircraft-gear-engines', 'Gear and engines', 'bay-4', 'engine-install', [-184, 85]),
  aircraftAtBay('aircraft-cabin', 'Cabin installation', 'bay-5', 'cabin', [-40, 85]),
  aircraftAtBay('aircraft-ground-check', 'Ground checks and rework', 'bay-6', 'complete', [104, 85]),
  aircraftAtBay('aircraft-paint', 'Masked aircraft in paint', 'paint', 'paint', [104, -30]),
  { ...aircraftAtBay('aircraft-delivery', 'Accepted A-100', 'delivery', 'complete', [420, 280]), rotationY: -Math.PI / 2 },
  { ...aircraftAtBay('aircraft-delivery-02', 'Aircraft at flight-line checks', 'flightline', 'complete', [230, 280]), rotationY: -Math.PI / 2 },
];

export const fixtures: FixtureEntity[] = [
  { id: 'join-platform-port', kind: 'platform', label: 'Join platform · aisle side', zoneId: 'bay-1', positionM: [-184, 0, -103], sizeM: [16, 4.2, 4] },
  { id: 'join-platform-starboard', kind: 'platform', label: 'Join platform · wall side', zoneId: 'bay-1', positionM: [-184, 0, -187], sizeM: [16, 4.2, 4] },
  { id: 'wing-platform-port', kind: 'platform', label: 'Wing access stand', zoneId: 'bay-2', positionM: [-40, 0, -103], sizeM: [18, 4.2, 4] },
  { id: 'wing-platform-starboard', kind: 'platform', label: 'Wing access stand', zoneId: 'bay-2', positionM: [-40, 0, -187], sizeM: [18, 4.2, 4] },
  { id: 'systems-cart', kind: 'cart', label: 'Avionics cart', zoneId: 'bay-3', positionM: [137, 0, -145], sizeM: [3.4, 1.4, 1.8] },
  { id: 'engine-stand', kind: 'platform', label: 'Engine handling stand', zoneId: 'bay-4', positionM: [-184, 0, 127], sizeM: [12, 2.8, 5] },
  { id: 'cabin-cart', kind: 'cart', label: 'Cabin kit cart', zoneId: 'bay-5', positionM: [-6, 0, 85], sizeM: [3.4, 1.4, 1.8] },
  { id: 'test-cart', kind: 'cart', label: 'Ground test cart', zoneId: 'bay-6', positionM: [138, 0, 85], sizeM: [3.4, 1.4, 1.8] },
  { id: 'receiving-pallet-a', kind: 'pallet', label: 'Fuselage section pallet', zoneId: 'receiving', positionM: [-431, 0, -84], sizeM: [20, 2.8, 14], load: 'fuselage' },
  { id: 'receiving-pallet-b', kind: 'pallet', label: 'Wing and tail kit', zoneId: 'receiving', positionM: [-385, 0, -84], sizeM: [32, 4.8, 30], load: 'wing' },
  { id: 'receiving-pallet-c', kind: 'pallet', label: 'Cabin / electrical kits', zoneId: 'receiving', positionM: [-339, 0, -84], sizeM: [16, 2.8, 14], load: 'supplier-kits' },
  { id: 'receiving-rack-a', kind: 'rack', label: 'Receiving rack · structures', zoneId: 'receiving', positionM: [-432, 0, -28], sizeM: [16, 6, 4] },
  { id: 'receiving-rack-b', kind: 'rack', label: 'Receiving rack · engine kits', zoneId: 'receiving', positionM: [-408, 0, -28], sizeM: [16, 6, 4] },
  { id: 'stores-rack-west', kind: 'rack', label: 'Kitting rack 01', zoneId: 'stores', positionM: [268, 0, -155], sizeM: [20, 5.5, 3] },
  { id: 'stores-rack-centre', kind: 'rack', label: 'Parts rack 02', zoneId: 'stores', positionM: [300, 0, -155], sizeM: [20, 5.5, 3] },
  { id: 'stores-rack-east', kind: 'rack', label: 'Parts rack 03', zoneId: 'stores', positionM: [332, 0, -155], sizeM: [20, 5.5, 3] },
  { id: 'paint-pump-set', kind: 'cart', label: 'Paint service unit', zoneId: 'paint', positionM: [104, 0, 6], sizeM: [3.4, 1.4, 1.8] },
];

export type InspectableEntity = {
  id: string;
  kind: 'aircraft' | 'machine' | 'rack' | 'person' | 'vehicle';
  label: string;
  zoneId: string;
  positionM: [number, number, number];
  sizeM: [number, number, number];
  details: [string, string][];
  note: string;
};

export const transportEntities: InspectableEntity[] = [
  { id: 'cargo-freighter', kind: 'vehicle', label: 'Inbound cargo freighter', zoneId: 'inbound', positionM: [330, 0.7, -335], sizeM: [60, 14, 56],
    details: [['Role', 'Supplier cargo arrival'], ['Sample load', 'Wing cradle and systems kit'], ['Status', 'Unloading · illustrative'], ['Destination', 'Receiving / kitting']],
    note: 'A transport aircraft, separate from the fictional A-100 product. Load and status are static demo data.' },
  { id: 'inbound-train', kind: 'vehicle', label: 'Rail section delivery', zoneId: 'inbound', positionM: [-365, 0.7, -345], sizeM: [270, 12, 12],
    details: [['Role', 'Major section delivery'], ['Sample load', 'Covered fuselage sections'], ['Status', 'At unload siding · illustrative'], ['Handoff', 'Cradle → receiving']],
    note: 'A fictional composite supply route. The train and load are static props, not a site-specific logistics claim.' },
  { id: 'road-delivery-truck', kind: 'vehicle', label: 'Road kit delivery', zoneId: 'receiving', positionM: [-477, 0.7, -30], sizeM: [22, 5, 4.5],
    details: [['Role', 'Supplier road delivery'], ['Sample load', 'Cabin and electrical kits'], ['Status', 'At receiving dock · illustrative'], ['Clearance', 'Receiving dock approach']],
    note: 'A fictional static delivery vehicle with a defined receiving route.' },
  { id: 'rail-forklift', kind: 'vehicle', label: 'Rail unload forklift', zoneId: 'inbound', positionM: [-412, 0.7, -307], sizeM: [4.5, 3.5, 2.4],
    details: [['Role', 'Section cradle handling'], ['Sample load', 'Fuselage support cradle'], ['Status', 'Parked at unload point'], ['Route', 'Rail siding → receiving']],
    note: 'Illustrative handling equipment. No lift capacity or safety certification is implied.' },
  { id: 'material-tug', kind: 'vehicle', label: 'Receiving material tug', zoneId: 'receiving', positionM: [-358, 0.7, -56], sizeM: [6.5, 2.7, 2.4],
    details: [['Role', 'Kitted material transfer'], ['Sample load', 'Two supply carts'], ['Status', 'Staged at receiving'], ['Route', 'Receiving → main hall']],
    note: 'A stationary tug for the future route animation; the route is defined separately.' },
  { id: 'cargo-belt-loader', kind: 'vehicle', label: 'Freighter belt loader', zoneId: 'inbound', positionM: [312, 0.7, -321], sizeM: [5, 7, 24],
    details: [['Role', 'Cargo hold unloading'], ['Sample load', 'Wing and systems kit'], ['Status', 'At aircraft cargo door'], ['Handoff', 'Apron → receiving road']],
    note: 'Static illustrative loader positioned at the transport aircraft hold.' },
  { id: 'receiving-wing-stand', kind: 'machine', label: 'Wing kit cradle', zoneId: 'receiving', positionM: [-382, 0.7, -10], sizeM: [36, 7, 56],
    details: [['Role', 'Incoming wing support'], ['Sample load', 'A-100 wing assembly'], ['Status', 'Parked in receiving'], ['Clearance', 'Receiving work envelope']],
    note: 'A fictional support stand for an incoming component; no engineered load rating is represented.' },
  { id: 'receiving-engine-stand', kind: 'machine', label: 'Engine transport cradle', zoneId: 'receiving', positionM: [-350, 0.7, -10], sizeM: [14, 4, 8],
    details: [['Role', 'Engine kit staging'], ['Sample load', 'One engine module'], ['Status', 'Parked in receiving'], ['Transfer', 'Tug route to assembly']],
    note: 'Illustrative engine handling geometry with no certified lift or transport specification.' },
  { id: 'delivery-tug', kind: 'vehicle', label: 'Aircraft tow tug', zoneId: 'flightline', positionM: [265, 0.7, 224], sizeM: [8, 3.4, 3.4],
    details: [['Role', 'Aircraft apron handling'], ['Status', 'Parked beside tow lane'], ['Route', 'Paint bay → flight-line checks → delivery stand'], ['Clearance', 'Marked aircraft tow lane']],
    note: 'A static ground-support vehicle. Aircraft towing is a later movement increment.' },
  { id: 'ground-power-cart', kind: 'vehicle', label: 'Ground power cart', zoneId: 'delivery', positionM: [370, 0.7, 370], sizeM: [4.2, 2.6, 2.2],
    details: [['Role', 'Ground support'], ['Sample state', 'Parked · illustrative'], ['Assigned aircraft', 'A-100 · delivery stand 01'], ['Connection', 'Not connected']],
    note: 'Fictional ground equipment with no electrical connection or live readings.' },
];

export const people: InspectableEntity[] = [
  { id: 'person-tech-07', kind: 'person', label: 'Assembly technician 07', zoneId: 'bay-1', positionM: [-220, 0.7, -161], sizeM: [1, 1.75, 1],
    details: [['Role', 'Structures technician'], ['Illustrative task', 'Checking the fuselage joint'], ['Work area', 'Bay 01']], note: 'A fictional role and task. The scripted walk stays outside the aircraft envelope.' },
  { id: 'person-tech-12', kind: 'person', label: 'Assembly technician 12', zoneId: 'bay-3', positionM: [140, 0.7, -161], sizeM: [1, 1.75, 1],
    details: [['Role', 'Systems technician'], ['Illustrative task', 'Preparing an avionics test'], ['Work area', 'Bay 03']], note: 'A fictional role. No employee records or worker tracking.' },
  { id: 'person-tech-18', kind: 'person', label: 'Cabin technician 18', zoneId: 'bay-5', positionM: [-4, 0.7, 69], sizeM: [1, 1.75, 1],
    details: [['Role', 'Cabin technician'], ['Illustrative task', 'Preparing a cabin kit'], ['Work area', 'Bay 05']], note: 'A fictional role and task. The scripted walk stays outside the aircraft envelope.' },
  { id: 'person-stores-03', kind: 'person', label: 'Kitting operator 03', zoneId: 'stores', positionM: [256, 0.7, -136], sizeM: [1, 1.75, 1],
    details: [['Role', 'Materials operator'], ['Illustrative task', 'Preparing electrical kits'], ['Work area', 'Stores']], note: 'A fictional role and task, with no personal or employment data.' },
  ...[
    ['person-tech-21', 'Structures technician 21', 'bay-1', [-148, -161], 'Staging fasteners at the fuselage join'],
    ['person-tech-22', 'Wing technician 22', 'bay-2', [-76, -161], 'Checking wing alignment'],
    ['person-tech-23', 'Wing technician 23', 'bay-2', [-4, -161], 'Preparing the wing fixture'],
    ['person-tech-24', 'Systems technician 24', 'bay-3', [68, -161], 'Staging an electrical kit'],
    ['person-tech-25', 'Gear technician 25', 'bay-4', [-220, 69], 'Checking a landing-gear work card'],
    ['person-tech-26', 'Gear technician 26', 'bay-4', [-148, 69], 'Preparing an engine service kit'],
    ['person-tech-27', 'Cabin technician 27', 'bay-5', [-76, 69], 'Staging cabin fittings'],
    ['person-tech-28', 'Ground technician 28', 'bay-6', [140, 69], 'Preparing a ground-test checklist'],
    ['person-tech-29', 'Ground technician 29', 'bay-6', [68, 69], 'Inspecting a test-cart connection'],
  ].map(([id, label, zoneId, point, task]) => ({
    id: id as string, kind: 'person' as const, label: label as string, zoneId: zoneId as string,
    positionM: [(point as number[])[0], 0.7, (point as number[])[1]] as [number, number, number], sizeM: [1, 1.75, 1] as [number, number, number],
    details: [['Role', label as string], ['Illustrative task', task as string],
      ['Work area', (zoneId as string).replace('bay-', 'Bay 0')]] as [string, string][],
    note: 'A fictional role and task. The scripted walk stays outside the aircraft envelope.',
  })),
  { id: 'person-stores-04', kind: 'person', label: 'Kitting operator 04', zoneId: 'stores', positionM: [256, 0.7, -174], sizeM: [1, 1.75, 1],
    details: [['Role', 'Materials operator'], ['Illustrative task', 'Staging a cabin kit'], ['Work area', 'Stores']], note: 'A fictional role and task, with no personal or employment data.' },
];

export const inspectableEntities: InspectableEntity[] = [
  ...aircraftEntities.map((aircraft, index): InspectableEntity => ({ ...aircraft, sizeM: [64, 17, 60],
    details: [['Model', 'A-100'], ['Sample serial', `A100-${String(index + 1).padStart(3, '0')}`], ['Build stage', aircraft.label]],
    note: 'Fictional single-product aircraft. Build stages are a simplified teaching sequence.' })),
  ...fixtures.filter(fixture => fixture.kind === 'cart' || fixture.kind === 'rack' || fixture.kind === 'platform')
    .map((fixture, index): InspectableEntity => ({ ...fixture, kind: fixture.kind === 'rack' ? 'rack' : 'machine',
      details: fixture.kind === 'rack'
        ? [['Contents', fixture.id === 'stores-rack-west' ? 'Electrical kits' : 'Cabin fittings'], ['Sample quantity', fixture.id === 'stores-rack-west' ? '18 kits' : '24 bins'], ['Storage', 'Three shelf levels']]
        : [['Sample asset', `EQ-${String(index + 1).padStart(2, '0')}`], ['Sample mode', fixture.kind === 'cart' ? 'Ready / stationary' : 'Parked / stationary'], ['Assigned area', fixture.zoneId.replace('bay-', 'Bay ')], ['Equipment', fixture.kind === 'cart' ? 'Mobile service unit' : 'Access / handling stand']],
      note: 'Illustrative equipment information. Values are fixed sample data, with no machine connection.' })),
  ...people,
  ...transportEntities,
];

export function isSelectionClick(button: number, distancePx: number): boolean {
  return button === 0 && distancePx <= 5;
}

export type SceneSelection = { zoneId: string | null; entityId: string | null };

export function selectEntityById(id: string): SceneSelection | null {
  const entity = inspectableEntities.find(candidate => candidate.id === id);
  return entity ? { zoneId: entity.zoneId, entityId: entity.id } : null;
}
