import { DoubleSide } from 'three';
import type { MeshStandardMaterialParameters } from 'three';

export const finishes = {
  painted: { color: '#e9efee', roughness: 0.43, metalness: 0.12 },
  primer: { color: '#b5c9a0', roughness: 0.65, metalness: 0.08 },
  wing: { color: '#c7d2d5', roughness: 0.5, metalness: 0.25, side: DoubleSide },
  glass: { color: '#213440', roughness: 0.2, metalness: 0.22, side: DoubleSide },
  metal: { color: '#a8b6bd', roughness: 0.32, metalness: 0.65, side: DoubleSide },
  darkMetal: { color: '#455760', roughness: 0.42, metalness: 0.55 },
  duct: { color: '#253039', roughness: 0.8, metalness: 0.15, side: DoubleSide },
  rubber: { color: '#293238', roughness: 0.95, metalness: 0 },
  accent: { color: '#366c78', roughness: 0.5, metalness: 0.1, side: DoubleSide },
} satisfies Record<string, MeshStandardMaterialParameters>;
