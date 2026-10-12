export type RoutePointM = [xM: number, zM: number];

export type SiteRoute = {
  id: string;
  label: string;
  mode: 'rail-unload' | 'road-delivery' | 'material-tug' | 'aircraft-tow' | 'pedestrian';
  pointsM: RoutePointM[];
  dwellPointsM: RoutePointM[];
  crossings: { pointM: RoutePointM; label: string; yieldTo: 'pedestrians' | 'aircraft' | 'road-traffic' }[];
  clearWidthM: number;
};

// These are static centre-lines for AD-07. Later vehicle motion follows these
// surveyed-style waypoints; they are illustration data, not a traffic solver.
export const siteRoutes: SiteRoute[] = [
  { id: 'rail-to-receiving', label: 'Rail cradle handoff', mode: 'rail-unload',
    pointsM: [[-365, -345], [-365, -305], [-420, -305], [-490, -263], [-490, -30], [-455, -30]],
    dwellPointsM: [[-365, -345], [-455, -30]], crossings: [{ pointM: [-490, -263], label: 'North service road junction', yieldTo: 'road-traffic' }], clearWidthM: 14 },
  { id: 'cargo-to-receiving', label: 'Cargo apron road', mode: 'road-delivery',
    pointsM: [[330, -335], [420, -335], [420, -263], [-490, -263], [-490, -30], [-455, -30]],
    dwellPointsM: [[420, -335], [-455, -30]], crossings: [
      { pointM: [420, -282], label: 'Cargo apron footpath', yieldTo: 'pedestrians' },
      { pointM: [-460, -263], label: 'Receiving footpath', yieldTo: 'pedestrians' },
    ], clearWidthM: 18 },
  { id: 'supplier-truck-dock', label: 'Supplier truck approach', mode: 'road-delivery',
    pointsM: [[-490, 215], [-490, -30], [-455, -30]], dwellPointsM: [[-477, -30]], crossings: [], clearWidthM: 16 },
  { id: 'receiving-to-assembly', label: 'Kitted material transfer', mode: 'material-tug',
    pointsM: [[-435, -30], [-315, -30], [-260, -30], [-230, -45], [-195, -65], [-184, -83]],
    dwellPointsM: [[-435, -30], [-184, -83]], crossings: [], clearWidthM: 20 },
  { id: 'hall-to-delivery', label: 'Paint → checks → delivery tow route', mode: 'aircraft-tow',
    pointsM: [[104, -30], [180, -30], [205, -30], [215, -28], [223, -20], [228, -10], [230, 0], [230, 170],
      [230, 235], [230, 248], [230, 235], [420, 235], [420, 248], [420, 370]],
    dwellPointsM: [[104, -30], [230, 248], [420, 248]], crossings: [], clearWidthM: 60 },
  { id: 'apron-walkway', label: 'Cargo apron pedestrian path', mode: 'pedestrian',
    pointsM: [[150, -282], [510, -282]], dwellPointsM: [[420, -282]], crossings: [], clearWidthM: 6 },
  { id: 'receiving-walkway', label: 'Rail-to-receiving footpath', mode: 'pedestrian',
    pointsM: [[-465, -312], [-460, -263], [-460, -30]], dwellPointsM: [[-460, -263]], crossings: [], clearWidthM: 6 },
];

export function routeLengthM(route: SiteRoute): number {
  return route.pointsM.slice(1).reduce((total, point, index) => {
    const previous = route.pointsM[index];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
}

export type PersonRoute = {
  entityId: string;
  pointsM: RoutePointM[];
  speedMps: number;
  workSeconds: number;
  phaseSeconds: number;
};

// Short bay-side walks: each corridor stays beyond the A-100's 60 m footprint.
// Workers pause at both ends to represent inspection or kit preparation.
export const personRoutes: PersonRoute[] = [
  { entityId: 'person-tech-07', pointsM: [[-220, -161], [-220, -129]], speedMps: 0.9, workSeconds: 7, phaseSeconds: 0 },
  { entityId: 'person-tech-21', pointsM: [[-148, -161], [-148, -129]], speedMps: 0.9, workSeconds: 6, phaseSeconds: 11 },
  { entityId: 'person-tech-22', pointsM: [[-76, -161], [-76, -129]], speedMps: 0.9, workSeconds: 7, phaseSeconds: 5 },
  { entityId: 'person-tech-23', pointsM: [[-4, -161], [-4, -129]], speedMps: 0.9, workSeconds: 6, phaseSeconds: 17 },
  { entityId: 'person-tech-12', pointsM: [[140, -161], [140, -129]], speedMps: 0.9, workSeconds: 7, phaseSeconds: 3 },
  { entityId: 'person-tech-24', pointsM: [[68, -161], [68, -129]], speedMps: 0.9, workSeconds: 6, phaseSeconds: 21 },
  { entityId: 'person-tech-25', pointsM: [[-220, 69], [-220, 101]], speedMps: 0.9, workSeconds: 8, phaseSeconds: 9 },
  { entityId: 'person-tech-26', pointsM: [[-148, 69], [-148, 101]], speedMps: 0.9, workSeconds: 6, phaseSeconds: 23 },
  { entityId: 'person-tech-18', pointsM: [[-4, 69], [-4, 101]], speedMps: 0.9, workSeconds: 7, phaseSeconds: 6 },
  { entityId: 'person-tech-27', pointsM: [[-76, 69], [-76, 101]], speedMps: 0.9, workSeconds: 6, phaseSeconds: 16 },
  { entityId: 'person-tech-28', pointsM: [[140, 69], [140, 101]], speedMps: 0.9, workSeconds: 8, phaseSeconds: 2 },
  { entityId: 'person-tech-29', pointsM: [[68, 69], [68, 101]], speedMps: 0.9, workSeconds: 6, phaseSeconds: 19 },
  { entityId: 'person-stores-03', pointsM: [[256, -136], [344, -136]], speedMps: 1, workSeconds: 9, phaseSeconds: 4 },
  { entityId: 'person-stores-04', pointsM: [[256, -174], [344, -174]], speedMps: 1, workSeconds: 8, phaseSeconds: 18 },
];

export type PersonPose = { xM: number; zM: number; heading: number; gait: number; working: boolean };

export function personPoseAt(route: PersonRoute, elapsedSeconds: number): PersonPose {
  const segments = route.pointsM.map((point, index) => {
    const next = route.pointsM[(index + 1) % route.pointsM.length];
    const lengthM = Math.hypot(next[0] - point[0], next[1] - point[1]);
    return { point, next, lengthM, walkSeconds: lengthM / route.speedMps };
  });
  const loopSeconds = segments.reduce((sum, segment) => sum + segment.walkSeconds + route.workSeconds, 0);
  let remaining = ((elapsedSeconds + route.phaseSeconds) % loopSeconds + loopSeconds) % loopSeconds;
  for (const segment of segments) {
    if (remaining < route.workSeconds) {
      return { xM: segment.point[0], zM: segment.point[1], heading: Math.atan2(
        segment.next[0] - segment.point[0], segment.next[1] - segment.point[1]), gait: 0, working: true };
    }
    remaining -= route.workSeconds;
    if (remaining < segment.walkSeconds) {
      const progress = remaining / segment.walkSeconds;
      const distanceM = progress * segment.lengthM;
      return { xM: segment.point[0] + (segment.next[0] - segment.point[0]) * progress,
        zM: segment.point[1] + (segment.next[1] - segment.point[1]) * progress,
        heading: Math.atan2(segment.next[0] - segment.point[0], segment.next[1] - segment.point[1]),
        gait: Math.sin(distanceM * Math.PI * 2 / 1.35), working: false };
    }
    remaining -= segment.walkSeconds;
  }
  const first = route.pointsM[0];
  return { xM: first[0], zM: first[1], heading: 0, gait: 0, working: true };
}
