import { BufferGeometry, Float32BufferAttribute, Shape, ExtrudeGeometry, Vector2, LatheGeometry } from 'three';

export type AircraftVariant = 'sectioned' | 'joined-fuselage' | 'bare' | 'systems' | 'engine-install' | 'cabin' | 'ready-for-paint' | 'complete' | 'paint';
export type Cutaway = 'systems' | 'cabin';

// Original A-100 design, in metres. +X is forward; ground is Y=0.
// Radius and vertical centre describe a gently drooped nose and lifted tailcone.
const profile = [
  [-30, 0.04, 7.1], [-28, 0.7, 6.9], [-24, 1.8, 6.5], [-18, 2.8, 6.25],
  [-10, 3.15, 6.2], [0, 3.2, 6.2], [10, 3.2, 6.2], [18, 3.2, 6.2],
  [22, 3.0, 6.15], [25, 2.45, 6.0], [27, 1.6, 5.8], [29, 0.55, 5.65], [30, 0.04, 5.6],
];

export function bodyAt(xM: number) {
  const index = xM >= 30 ? profile.length - 2 : Math.max(0, profile.findIndex((_, i) => i < profile.length - 1 && xM <= profile[i + 1][0]));
  const a = profile[index];
  const b = profile[index + 1];
  const t = Math.max(0, Math.min(1, (xM - a[0]) / (b[0] - a[0])));
  function interpolate(field: number) {
    const prev = profile[Math.max(0, index - 1)];
    const next = profile[Math.min(profile.length - 1, index + 2)];
    const slopeA = (b[field] - prev[field]) / (b[0] - prev[0]);
    const slopeB = (next[field] - a[field]) / (next[0] - a[0]);
    const distance = b[0] - a[0];
    return (2 * t ** 3 - 3 * t ** 2 + 1) * a[field] + (t ** 3 - 2 * t ** 2 + t) * slopeA * distance
      + (-2 * t ** 3 + 3 * t ** 2) * b[field] + (t ** 3 - t ** 2) * slopeB * distance;
  }
  return { radiusM: Math.max(0.04, interpolate(1)), centerYM: interpolate(2) };
}

function geometry(vertices: number[], indices: number[]) {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  result.setIndex(indices);
  result.computeVertexNormals();
  result.computeBoundingBox();
  return result;
}

export function fuselageGeometry(startM = -30, endM = 30, inner = false, cutaway?: Cutaway) {
  const rings = Math.ceil((endM - startM) / 0.35);
  const sides = 64;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const x = startM + (endM - startM) * ring / rings;
    const { radiusM, centerYM } = bodyAt(x);
    const radius = Math.max(0.025, radiusM - (inner ? 0.075 : 0));
    for (let side = 0; side <= sides; side++) {
      const theta = side / sides * Math.PI * 2;
      vertices.push(x, centerYM + radius * Math.sin(theta), radius * Math.cos(theta));
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let side = 0; side < sides; side++) {
      const x = startM + (endM - startM) * (ring + 0.5) / rings;
      const theta = (side + 0.5) / sides * Math.PI * 2;
      const systemOpening = cutaway === 'systems' && x >= -2 && x <= 4 && theta >= 0.20 && theta <= 0.60;
      const cabinOpening = cutaway === 'cabin' && x >= -8 && x <= 0 && theta >= -0.55 && theta <= 0.50;
      if (systemOpening || cabinOpening) continue;
      const a = ring * (sides + 1) + side;
      const b = a + sides + 1;
      const faces = [a, b, b + 1, a, b + 1, a + 1];
      if (inner) faces.reverse();
      indices.push(...faces);
    }
  }
  return geometry(vertices, indices);
}

export function bodyPatch(startM: number, endM: number, lowAngle: number, highAngle: number, side: number) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const slices = 12;
  const angularSlices = 8;
  for (let i = 0; i <= slices; i++) {
    const x = startM + (endM - startM) * i / slices;
    const body = bodyAt(x);
    for (let j = 0; j <= angularSlices; j++) {
      const angle = lowAngle + (highAngle - lowAngle) * j / angularSlices;
      vertices.push(x, body.centerYM + (body.radiusM + 0.045) * Math.sin(angle),
        side * (body.radiusM + 0.045) * Math.cos(angle));
    }
  }
  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < angularSlices; j++) {
      const a = i * (angularSlices + 1) + j;
      const b = a + angularSlices + 1;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return geometry(vertices, indices);
}

export function cockpitWindshieldGeometry(side: number, frame = false) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const angleSteps = 16;
  const lengthSteps = 12;
  for (let i = 0; i <= angleSteps; i++) {
    const t = i / angleSteps;
    const angle = 0.31 + t * 1.13;
    const startX = 24.75 + 0.72 * t;
    const endX = 26.25 + 2.18 * t;
    for (let j = 0; j <= lengthSteps; j++) {
      const x = startX + (endX - startX) * j / lengthSteps;
      const body = bodyAt(x);
      const radius = body.radiusM + (frame ? 0.075 : 0.095);
      vertices.push(x, body.centerYM + radius * Math.sin(angle),
        side * radius * Math.cos(angle));
    }
  }
  const row = lengthSteps + 1;
  for (let i = 0; i < angleSteps; i++) {
    for (let j = 0; j < lengthSteps; j++) {
      const a = i * row + j;
      const b = a + row;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return geometry(vertices, indices);
}

type WingSection = [spanM: number, leadingXM: number, trailingXM: number, heightM: number, thicknessM: number];
function wingLoft(stations: WingSection[]) {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [z, lead, trail, y, thickness] of stations) {
    vertices.push(lead, y, z, trail, y, z, trail, y - thickness, z, lead, y - thickness, z);
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let edge = 0; edge < 4; edge++) {
      const a = i * 4 + edge;
      const b = i * 4 + (edge + 1) % 4;
      indices.push(a, a + 4, b + 4, a, b + 4, b);
    }
  }
  indices.push(0, 1, 2, 0, 2, 3);
  const last = (stations.length - 1) * 4;
  indices.push(last, last + 2, last + 1, last, last + 3, last + 2);
  return geometry(vertices, indices);
}

export function wingGeometry() {
  return wingLoft([
    [0, 6.8, -10.8, 4.9, 0.75], [5, 3, -10.4, 5.1, 0.5], [12, -2, -11.8, 5.5, 0.3],
    [23, -9, -13, 6.1, 0.14], [27.2, -12, -14, 6.5, 0.07],
  ]);
}

export function stabilizerGeometry() {
  return wingLoft([[0, -20, -29.3, 7.4, 0.4], [4, -22, -29.3, 7.8, 0.25], [9, -25.5, -29.3, 8.5, 0.1]]);
}

export function polygonPrism(points: [number, number][], depthM: number) {
  const shape = new Shape();
  shape.moveTo(...points[0]);
  points.slice(1).forEach(point => shape.lineTo(...point));
  shape.closePath();
  const result = new ExtrudeGeometry(shape, { depth: depthM, bevelEnabled: false, steps: 1 });
  result.translate(0, 0, -depthM / 2);
  return result;
}

export function tailFinGeometry() {
  return polygonPrism([[-18.8, 7.4], [-25.5, 17], [-29.6, 16.8], [-29.5, 7.4]], 0.36);
}

export function nacelleGeometry() {
  const result = new LatheGeometry([
    new Vector2(0.92, -3), new Vector2(1.25, -2.5), new Vector2(1.53, -1),
    new Vector2(1.65, 1), new Vector2(1.65, 2.6), new Vector2(1.57, 3),
  ], 64);
  result.rotateZ(-Math.PI / 2);
  return result;
}

export function fanBladeGeometry() {
  return polygonPrism([[0.32, -0.08], [0.54, -0.16], [1.3, -0.01], [1.34, 0.13], [0.7, 0.1]], 0.035);
}

export const doorPositionsM = [-19, -8, 3.5, 17.8];
