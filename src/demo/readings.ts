import type { InspectableEntity } from './entities.ts';
import type { StationActionState } from './station-actions.ts';

export type DemoReading = { label: string; value: string; unit?: string };

export function readingsForEntity(entity: InspectableEntity, elapsedSeconds: number,
  action: StationActionState | null): DemoReading[] {
  if (entity.kind !== 'machine') return [];
  const active = action?.active === true;
  const readings: DemoReading[] = [
    { label: 'Sample status', value: action?.mode ?? 'Ready · stationary' },
    { label: 'Work progress', value: active ? `${Math.round(action.progress * 100)}%` : 'Standby' },
  ];
  if (entity.id === 'paint-carriage') {
    const temperature = 21 + Math.sin(Math.max(0, elapsedSeconds) * Math.PI / 90) * 1.5;
    readings.push({ label: 'Booth air sample', value: temperature.toFixed(1), unit: '°C' });
  }
  return readings;
}
