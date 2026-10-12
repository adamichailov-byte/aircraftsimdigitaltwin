import { bays } from './campus.ts';

export type Zone = {
  id: string;
  label: string;
  location: string;
  centerM: [number, number];
  sizeM: [number, number];
  bannerM?: [number, number, number];
  focusCenterM?: [number, number];
  focusSizeM?: [number, number];
};

export const zones: Zone[] = [
  { id: 'inbound', label: 'Inbound logistics', location: 'Cargo apron + rail siding', centerM: [0, -335], sizeM: [1100, 120],
    bannerM: [470, 31, -335], focusCenterM: [0, -335], focusSizeM: [1100, 120] },
  { id: 'receiving', label: 'Receiving & inspection', location: 'Receiving / kitting', centerM: [-385, -30], sizeM: [140, 180],
    bannerM: [-440, 24, 40], focusCenterM: [-385, -30], focusSizeM: [140, 180] },
  { id: 'stores', label: 'Stores & kitting', location: 'Parts / inventory', centerM: [300, -155], sizeM: [140, 120],
    bannerM: [245, 20, -105], focusCenterM: [300, -155], focusSizeM: [140, 120] },
  ...bays.map((bay, index) => ({
    id: `bay-${index + 1}`,
    label: `Bay ${bay.number}`,
    location: `${bay.row === 0 ? 'South' : 'North'} row · ${index % 3 + 1}/3`,
    centerM: bay.centerM,
    sizeM: [bay.lengthM, bay.widthM] as [number, number],
    bannerM: [bay.centerM[0] - bay.lengthM / 2 + 12, 31, bay.centerM[1] + bay.widthM / 2 - 12] as [number, number, number],
    focusCenterM: bay.centerM,
    focusSizeM: [82, 82] as [number, number],
  })),
  { id: 'paint', label: 'Paint enclosure', location: 'Main hall · central aisle', centerM: [104, -30], sizeM: [88, 80],
    bannerM: [72, 30, 5], focusCenterM: [104, -30], focusSizeM: [88, 80] },
  { id: 'flightline', label: 'Flight-line checks', location: 'Apron · check stand 01', centerM: [230, 280], sizeM: [88, 88],
    bannerM: [186, 31, 324], focusCenterM: [230, 280], focusSizeM: [88, 88] },
  { id: 'delivery', label: 'Delivery stands', location: 'Apron · stands 01–02', centerM: [420, 325], sizeM: [100, 190],
    bannerM: [420, 31, 420], focusCenterM: [420, 325], focusSizeM: [100, 190] },
  { id: 'flight-test', label: 'Flight test', location: 'Off site · after acceptance', centerM: [0, 0], sizeM: [0, 0] },
];

export const processSteps = [
  { order: 1, group: 'Supply', title: 'Inbound logistics', zoneId: 'inbound' },
  { order: 2, group: 'Supply', title: 'Receiving & inspection', zoneId: 'receiving' },
  { order: 3, group: 'Supply', title: 'Stores & kitting', zoneId: 'stores' },
  { order: 4, group: 'Assembly', title: 'Fuselage join', zoneId: 'bay-1' },
  { order: 5, group: 'Assembly', title: 'Wing & tail join', zoneId: 'bay-2' },
  { order: 6, group: 'Assembly', title: 'Systems installation', zoneId: 'bay-3' },
  { order: 7, group: 'Assembly', title: 'Landing gear & engines', zoneId: 'bay-4' },
  { order: 8, group: 'Assembly', title: 'Cabin installation', zoneId: 'bay-5' },
  { order: 9, group: 'Assembly', title: 'Paint', zoneId: 'paint' },
  { order: 10, group: 'Assembly', title: 'Ground checks & rework', zoneId: 'bay-6' },
  { order: 11, group: 'Completion', title: 'Flight-line acceptance', zoneId: 'flightline' },
  { order: 12, group: 'Completion', title: 'Flight test', zoneId: 'flight-test' },
  { order: 13, group: 'Completion', title: 'Finished delivery', zoneId: 'delivery' },
] as const;
