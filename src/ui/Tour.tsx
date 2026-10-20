import { tourStops } from '../demo/tour.ts';

export function Tour({ index, onBack, onNext, onExit }: {
  index: number | null; onBack: () => void; onNext: () => void; onExit: () => void;
}) {
  if (index === null) return null;
  const stop = tourStops[index];
  return <aside className="tour-panel" aria-label="Guided plant tour" aria-live="polite">
    <div className="tour-heading"><span className="eyebrow">GUIDED TOUR · {index + 1} OF {tourStops.length}</span>
      <button onClick={onExit} aria-label="Exit guided tour">Exit</button></div>
    <h2>{stop.title}</h2><p>{stop.description}</p>
    <div className="tour-controls">
      <button onClick={onBack} disabled={index === 0} aria-label="Previous tour stop">Back</button>
      <button className="tour-next" onClick={onNext}>{index === tourStops.length - 1 ? 'Finish' : 'Next'}</button>
    </div>
    <span className="tour-hint">← / → to move · Esc to exit · orbit freely</span>
  </aside>;
}
