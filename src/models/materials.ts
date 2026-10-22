import { DoubleSide } from 'three';
import type { MeshStandardMaterialParameters } from 'three';

// Scene colors describe surfaces; operational status colors remain in the UI.
export const scenePalette = {
  concrete: '#434744', apron: '#333735', ground: '#282D2B', siteEdge: '#202523',
  steel: '#656D69', cladding: '#737C76', skylight: '#89958E', roofSeam: '#5C6760',
  tooling: '#788574', equipment: '#AB975C', platformDeck: '#7B857F',
  primer: '#92AC73', paint: '#F0F1EB', rubber: '#202D35',
  road: '#303633', pedestrian: '#667466', marking: '#9EA67F',
  floorInk: '#CDD1BF', apronInk: '#C3C8B7', paintFloor: '#6D7565',
  background: '#1B211E', backdrop: '#242B27',
} as const;

export const daylight = {
  sky: '#E9F0EE', ground: '#69756E', fill: 1.25, sun: 1.35,
} as const;

export const finishes = {
  painted: { color: scenePalette.paint, roughness: 0.36, metalness: 0.08 },
  primer: { color: scenePalette.primer, roughness: 0.78, metalness: 0.04 },
  wing: { color: '#c7d2d5', roughness: 0.5, metalness: 0.25, side: DoubleSide },
  glass: { color: scenePalette.rubber, roughness: 0.18, metalness: 0.22, side: DoubleSide },
  metal: { color: '#a8b6bd', roughness: 0.32, metalness: 0.65, side: DoubleSide },
  darkMetal: { color: scenePalette.steel, roughness: 0.42, metalness: 0.55 },
  duct: { color: '#253039', roughness: 0.8, metalness: 0.15, side: DoubleSide },
  rubber: { color: scenePalette.rubber, roughness: 0.95, metalness: 0 },
  accent: { color: scenePalette.tooling, roughness: 0.5, metalness: 0.1, side: DoubleSide },
} satisfies Record<string, MeshStandardMaterialParameters>;
