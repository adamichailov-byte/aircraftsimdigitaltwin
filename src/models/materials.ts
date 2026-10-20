import { DoubleSide } from 'three';
import type { MeshStandardMaterialParameters } from 'three';

// Scene colors describe surfaces; operational status colors remain in the UI.
export const scenePalette = {
  concrete: '#A9AEA9', apron: '#818A91', ground: '#657361', siteEdge: '#515E50',
  steel: '#344653', cladding: '#C8CFD1', skylight: '#97AFB8', roofSeam: '#AAB7BD',
  tooling: '#365F72', equipment: '#C89935', platformDeck: '#7F9199',
  primer: '#92AC73', paint: '#F0F1EB', rubber: '#202D35',
  road: '#616F79', pedestrian: '#789D9D', marking: '#F0C94E',
  floorInk: '#344653', apronInk: '#F0F1EB', paintFloor: '#B8C4C3',
  background: '#E7ECEF', backdrop: '#D7DDD9',
} as const;

export const daylight = {
  sky: '#FFFFFF', ground: '#9CA69A', fill: 0.85, sun: 1.8,
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
