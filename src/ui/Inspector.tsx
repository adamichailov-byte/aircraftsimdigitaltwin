import { useEffect, useRef, useState } from 'react';
import { inspectableEntities, type InspectableEntity } from '../demo/entities';
import type { Zone } from '../demo/zones';
import { demoClock } from '../demo/clock';
import { stationActionAt } from '../demo/station-actions';
import { aircraftStoryIds, storyAt, storyMachineTimeAt } from '../demo/story';
import { readingsForEntity } from '../demo/readings';

const kindNames = { aircraft: 'Aircraft', machine: 'Equipment', rack: 'Inventory rack', person: 'Person', vehicle: 'Vehicle' };

export function Inspector({ zone, entity, onSelect, onClose }: {
  zone: Zone; entity?: InspectableEntity; onSelect: (id: string, trigger: HTMLElement) => void; onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(demoClock.getElapsedSeconds());
  useEffect(() => { if (entity) heading.current?.focus(); }, [entity?.id]);
  useEffect(() => {
    const syncElapsed = () => setElapsedSeconds(demoClock.getElapsedSeconds());
    const unsubscribe = demoClock.subscribe(syncElapsed);
    const interval = window.setInterval(syncElapsed, 250);
    return () => { unsubscribe(); window.clearInterval(interval); };
  }, [entity?.id]);
  const isStoryAircraft = entity?.kind === 'aircraft' && aircraftStoryIds.includes(entity.id);
  const storyPose = isStoryAircraft ? storyAt(elapsedSeconds, entity.id) : null;
  const stationAction = entity ? stationActionAt(entity.id, storyMachineTimeAt(elapsedSeconds)) : null;
  const readings = entity ? readingsForEntity(entity, elapsedSeconds, stationAction) : [];
  const local = inspectableEntities.filter(candidate => candidate.kind === 'aircraft' && aircraftStoryIds.includes(candidate.id)
    ? storyAt(elapsedSeconds, candidate.id).zoneId === zone.id : candidate.zoneId === zone.id);
  const details = storyPose && entity
    ? [...entity.details.map(([label, value]) => [label, label === 'Build stage' ? storyPose.stageLabel : value] as [string, string]),
      ['Flow status', storyPose.mode === 'waiting' ? `Holding · ${storyPose.waitingFor}`
        : storyPose.mode === 'queue' ? 'Waiting for Bay 01' : storyPose.mode === 'transit' ? 'Transferring · compressed demo' : storyPose.mode]]
    : entity?.details ?? [];
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
      <span className="sample-label">Illustrative readings · demo data</span>
      {readings.length > 0 && <section className="sample-readings" aria-label="Illustrative machine readings">
        <span className="sample-readings-title">DEMO DATA</span>
        <dl>{readings.map(reading => <div key={reading.label}>
          <dt>{reading.label}</dt><dd>{reading.value}{reading.unit ? ` ${reading.unit}` : ''}</dd>
        </div>)}</dl>
      </section>}
      <dl className="entity-details">{details.map(([label, value]) => <div key={label}>
        <dt>{label}</dt><dd>{label === 'Sample mode' && stationAction ? stationAction.mode : value}</dd>
      </div>)}
        {stationAction && <div><dt>Cycle step</dt><dd>{stationAction.phase}</dd></div>}
      </dl>
      <p className="entity-note">{isStoryAircraft
        ? 'This aircraft has its own sample serial and keeps its assemblies as it advances through the occupied production line.'
        : stationAction ? 'This sample mode follows the scripted machine action and shared demonstration clock.' : entity.note}</p>
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
