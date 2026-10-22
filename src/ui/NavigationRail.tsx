type Destination = 'campus'|'process'|'receiving'|'schedule'|'timeline'|'results'|'history'|'help'|'settings';
const paths:Record<Destination,string>={
  campus:'M3 10 12 4l9 6v10H3Z M8 20v-7h8v7',
  process:'M4 5h16v14H4Z M8 5v14 M8 10h12 M8 15h12',
  receiving:'m3 8 9-5 9 5v9l-9 5-9-5Z M3 8l9 5 9-5 M12 13v9 M8 5l9 5',
  schedule:'M4 5h16v16H4Z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 18h2',
  timeline:'M4 4v16h17 M7 15l4-5 4 3 5-7',
  results:'M4 4v16h17 M7 15l4-5 4 3 5-7',
  history:'M4 9a8 8 0 1 1 0 7 M4 3v6h6 M12 7v5l3 2',
  settings:'M4 4h16v16H4Z M8 8h8 M8 12h8 M8 16h8 M10 6v4 M14 10v4 M10 14v4',
  help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
const labels:Record<Destination,string>={campus:'Campus overview',process:'Production stages',receiving:'Receiving workspace',schedule:'Open master schedule',timeline:'Open flow timeline',results:'Production results',history:'Recorded history',help:'Camera instructions',settings:'Simulation settings'};
export function NavigationRail({active,onNavigate}:{active:Destination;onNavigate:(destination:Destination)=>void}){
  return <nav className="navigation-rail" aria-label="Workspace navigation">
    <span className="rail-brand" title="Assembly." aria-label="Assembly.">A<span>•</span></span>
    {(Object.keys(paths) as Destination[]).map(destination=><button key={destination}
      title={labels[destination]} aria-label={labels[destination]} aria-pressed={active===destination}
      onClick={()=>onNavigate(destination)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[destination]}/></svg>
    </button>)}
    <span className="rail-footer">SIM</span>
  </nav>;
}
