import { useEffect, useRef } from 'react';
import { inspectableEntities, type InspectableEntity } from '../demo/entities';
import type { Zone } from '../demo/zones';

const kindNames = { aircraft: 'Aircraft', machine: 'Equipment', rack: 'Inventory rack', person: 'Person', vehicle: 'Vehicle' };

export function Inspector({ zone, entity, onSelect, onClose }: {
  zone: Zone; entity?: InspectableEntity; onSelect: (id: string, trigger: HTMLElement) => void; onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (entity) heading.current?.focus(); }, [entity?.id]);
  const local = inspectableEntities.filter(candidate => candidate.zoneId === zone.id);
  return <aside className="inspector" aria-label="Object inspection" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }}>
    <div className="inspector-heading">
      <div><span className="eyebrow">{entity ? kindNames[entity.kind] : 'EXPLORE THIS AREA'}</span>
        <h2 ref={heading} tabIndex={-1}>{entity?.label ?? zone.label}</h2></div>
      <button aria-label="Close inspection" onClick={onClose}>Close</button>
    </div>
    <p className="inspector-location">{zone.label} <span> / </span> {zone.location}</p>
    {entity ? <>
      <span className="sample-label">Illustrative readings · fixed sample data</span>
      <dl className="entity-details">{entity.details.map(([label, value]) => <div key={label}>
        <dt>{label}</dt><dd>{value}</dd>
      </div>)}</dl>
      <p className="entity-note">{entity.note}</p>
    </> : <p className="entity-note">Select an object in the model or choose one below to inspect its sample information.</p>}
    <section className="entity-list" aria-label={`Objects in ${zone.label}`}>
      <h3>Objects in this area <span>{local.length}</span></h3>
      {local.length === 0 ? <p className="entity-note">This area is scenery in the current increment.</p> : <ul>
        {local.map(candidate => <li key={candidate.id}>
          <button aria-pressed={candidate.id === entity?.id} onClick={event => onSelect(candidate.id, event.currentTarget)}>
            <strong>{candidate.label}</strong><span>{kindNames[candidate.kind]}</span>
          </button>
        </li>)}
      </ul>}
    </section>
  </aside>;
}
