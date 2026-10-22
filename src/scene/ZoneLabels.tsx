import { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { zones } from '../demo/zones';
import { overviewZoneIds } from '../demo/zone-labels';
import { chooseBannerIds } from './label-priority';

const overviewZones = new Set(overviewZoneIds);
const priority = new Map(overviewZoneIds.map((id, index) => [id, index]));

export function ZoneLabels({ selectedZoneId, onSelectZone }: {
  selectedZoneId: string | null;
  onSelectZone: (id: string) => void;
}) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const { camera, size } = useThree();
  const selected = zones.find(zone => zone.id === selectedZoneId);
  const visibleZones = useMemo(() => zones.filter(zone => zone.bannerM && zone.focusCenterM), []);
  const projected = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const local = selected?.focusCenterM
      ? visibleZones.filter(zone => zone.id === selected.id || Math.hypot(
        zone.focusCenterM![0] - selected.focusCenterM![0], zone.focusCenterM![1] - selected.focusCenterM![1]) <= 255)
      : visibleZones.filter(zone => overviewZones.has(zone.id));
    const candidates = local.flatMap(zone => {
      const button = buttons.current.get(zone.id);
      if (!button) return [];
      projected.set(...zone.bannerM!).project(camera);
      if (projected.z < -1 || projected.z > 1) return [];
      return [{ id: zone.id, x: (projected.x + 1) * size.width / 2, y: (1 - projected.y) * size.height / 2,
        width: button.offsetWidth, height: button.offsetHeight, priority: priority.get(zone.id) ?? 99 }];
    });
    const chosen = new Set(chooseBannerIds(candidates, selectedZoneId, selectedZoneId ? 7 : 12, size.width, size.height));
    for (const zone of visibleZones) {
      const button = buttons.current.get(zone.id);
      if (button) button.parentElement!.style.visibility = chosen.has(zone.id) ? 'visible' : 'hidden';
    }
  });

  return <group>
    {visibleZones.map(zone => <Html key={zone.id} position={zone.bannerM} center zIndexRange={[1, 1]}>
      <button ref={element => {
        if (element) buttons.current.set(zone.id, element);
        else buttons.current.delete(zone.id);
      }} className={`zone-banner is-bay${selectedZoneId === zone.id ? ' is-selected' : ''}`}
        aria-pressed={selectedZoneId === zone.id} aria-label={`Focus ${zone.label}: ${zone.location}`}
        onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); onSelectZone(zone.id); }}>
        <span className="zone-banner-dot" aria-hidden="true" />{zone.label}
      </button>
    </Html>)}
  </group>;
}
