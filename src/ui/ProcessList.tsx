import { processSteps } from '../demo/zones';
import { zones } from '../demo/zones';

const zoneById = new Map(zones.map(zone => [zone.id, zone]));
const groups = ['Supply', 'Assembly', 'Completion'] as const;

export function ProcessList({ open, onToggle, selectedZoneId, onSelectZone }: {
  open: boolean;
  onToggle: () => void;
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
}) {
  return <aside className={`process-panel${open ? '' : ' is-collapsed'}`} aria-label="Aircraft build sequence">
    <header className="process-heading">
      <div><h2>Build sequence</h2>{open && <span className="process-count">13 stages</span>}</div>
      <button aria-expanded={open} aria-label={open ? 'Collapse build sequence' : 'Expand build sequence'}
        onClick={onToggle}>{open ? '−' : '+'}</button>
    </header>
    {open && <>
      {groups.map(group => <section key={group} className="process-group" aria-label={`${group} stages`}>
        <h3>{group}</h3>
        <ol>
          {processSteps.filter(step => step.group === group).map(step => {
            const zone = zoneById.get(step.zoneId)!;
            const selectable = Boolean(zone.focusCenterM && zone.focusSizeM);
            return <li key={step.order}>
              <span className="process-number">{String(step.order).padStart(2, '0')}</span>
              {selectable ? <button type="button" className="process-select" aria-pressed={selectedZoneId === zone.id}
                onClick={() => onSelectZone(zone.id)}>
                <strong>{step.title}</strong><small>{zone.label === step.title ? zone.location : zone.label}</small>
              </button> : <span className="process-step" aria-current={selectedZoneId === zone.id ? 'step' : undefined}>
                <strong>{step.title}</strong><small>{zone.location}</small>
              </span>}
            </li>;
          })}
        </ol>
      </section>)}
      <p className="process-note">Synthetic teaching sequence. Bay 06 ground checks precede paint, flight-line acceptance, an offsite flight and delivery. Aircraft wait for finite parts, stations, shared crews, equipment and transport. Receipts require inspection, kitting and a forklift drop before use.</p>
    </>}
  </aside>;
}
