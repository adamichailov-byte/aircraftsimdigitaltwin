export type BuildingSpec = {
  id: string;
  label: string;
  centerM: [number, number];
  lengthM: number;
  widthM: number;
  heightM: number;
  doorWidthM: number;
  doorHeightM: number;
  additionalEndDoors?: { centerOffsetM: number; widthM: number; heightM: number }[];
  northDoor?: {centerOffsetM:number;widthM:number;heightM:number};
  westDoor?: {centerOffsetM:number;widthM:number;heightM:number};
};

export const parcel = { lengthM: 1100, widthM: 850 };
export const buildings: BuildingSpec[] = [
  { id: 'assembly', label: 'FINAL ASSEMBLY', centerM: [-40, -30], lengthM: 440,
    widthM: 440, heightM: 32, doorWidthM: 90, doorHeightM: 24,
    additionalEndDoors: [{ centerOffsetM: 115, widthM: 90, heightM: 24 }] },
  { id: 'receiving', label: 'RECEIVING / KITTING', centerM: [-385, -30], lengthM: 140,
    widthM: 180, heightM: 18, doorWidthM: 12, doorHeightM: 8 },
  { id: 'support', label: 'PARTS / INVENTORY', centerM: [300, -155], lengthM: 140,
    widthM: 120, heightM: 14, doorWidthM: 8, doorHeightM: 6 },
];

export const bays = [-145, 85].flatMap((zM, row) => [-184, -40, 104].map((xM, column) => ({
  row,
  id: `bay-${row * 3 + column + 1}`, number: String(row * 3 + column + 1).padStart(2, '0'),
  centerM: [xM, zM] as [number, number], lengthM: 100, widthM: 120,
})));

export const flightCheckStand: [number, number] = [230, 280];
export const deliveryStands = [[420, 280], [420, 370]] as [number, number][];
export const cargoApron = { centerM: [330, -335] as [number, number], lengthM: 360, widthM: 120 };
export const rail = { startXM: -530, endXM: 70, zM: -345 };
export const tow = { widthM: 60, eastLaneXM: 230, turningZM: 170 };

// All aircraft production stays inside the square hall. Side buildings hold
// parts and inventory; only the main hall has aircraft-sized doors.
// Pull the default view in enough to make the campus the focus while retaining
// a clear margin around the apron and receiving yard at desktop size.
export const homePositionM: [number, number, number] = [760, 903, 1092];
export const homeTargetM: [number, number, number] = [0, 8, 0];
