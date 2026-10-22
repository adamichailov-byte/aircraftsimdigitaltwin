import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {FormEvent} from 'react';
import type {FleetClient} from '../simulation/client';
import {buildExperiment,defaultSettings,experimentStations,settingsForConfig} from '../simulation/experiments';
import {stationPoses} from '../simulation/transfers';
import {a100CostRates,materialCatalog} from '../simulation/fixtures/a100';
import type {CostRates} from '../simulation/costs';
import {CostBreakdown} from './CostBreakdown';
import {buildScenario,defaultScenario} from '../simulation/scenario';
import {ScenarioDrawer} from './ScenarioDrawer';

export function SimulationSettings({client,open,onClose,onRestart}:{client:FleetClient;open:boolean;onClose:()=>void;onRestart:()=>void}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot);
  const [draft,setDraft]=useState(()=>settingsForConfig(client.config)),[tab,setTab]=useState<'production'|'stress'|'stations'|'results'>('stress');
  const [unit,setUnit]=useState<'hours'|'days'>('hours'),[error,setError]=useState('');
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{setDraft(settingsForConfig(client.config));setError('');},[client,view.runId]);
  useEffect(()=>{if(open)heading.current?.focus();},[open]);
  const fleet=view.displayFleet,rates=draft.costRates??a100CostRates;
  const draftBase=useMemo(()=>{try{return buildExperiment(draft);}catch{return client.config;}},[draft,client,view.runId]);
  const scenario=draft.scenario??defaultScenario(draftBase),busy=view.state==='starting'||view.state==='computing';
  const tabs=['production','stress','stations','results'] as const;
  if(!open)return null;
  const changed=JSON.stringify(draft)!==JSON.stringify(settingsForConfig(client.config));
  const numeric=(key:'orderCount'|'releaseEveryWorkdays'|'wipLimit'|'crewScale',value:string)=>setDraft({...draft,[key]:value===''?NaN:Number(value)});
  const cost=(key:'laborPerHourCents'|'overtimePremiumPerHourCents'|'carryingPerDayCents'|'latenessPerDayCents',value:string)=>setDraft({...draft,costRates:{...rates,[key]:value===''?NaN:Math.round(Number(value)*100)}});
  const value=(n:number)=>Number.isFinite(n)?n:'';
  const apply=(event:FormEvent)=>{event.preventDefault();try{
    const config=buildScenario(draft);
    onRestart();client.reset(config);setError('');onClose();
  }catch(reason){setError(reason instanceof Error?reason.message:'Check the settings and try again.');}};
  return <section className="simulation-settings" aria-label="Simulation settings" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}>
    <header><div><span className="eyebrow">MODEL ASSUMPTIONS</span><h2 ref={heading} tabIndex={-1}>Simulation settings</h2></div><button onClick={onClose} aria-label="Close simulation settings">Close</button></header>
    <p className="settings-intro">Edit a draft and apply it to start a fresh run at the beginning. The run starts paused so you can press Play and watch it unfold.</p>
    <div className="scenario-applied"><span>{client.config.scenario?.version??'A100 baseline v1'} · seed {client.config.disruptions?.quality.seed??42} · config {client.config.scenario?.fingerprint??'baseline'}</span><div><button type="button" onClick={()=>client.play(false)}>Pause</button>{busy?<button type="button" onClick={()=>client.cancel()}>Cancel simulation advance</button>:<button type="button" disabled={view.history.cursor!==null||!fleet?.nextEventInstant} onClick={()=>{client.play(true);onClose();}}>Play simulation</button>}</div></div>
    <p className="scenario-state" role="status">{view.error|| (busy?(view.progressInstant?`Advancing simulation · ${new Date(view.progressInstant).toLocaleString('en-US',{timeZone:client.config.recipe.calendar.timeZone})}`:'Starting simulation…'):view.state==='cancelled'?'Simulation paused; progress retained':fleet?.diagnosis||fleet?.status||'Starting')}</p>
    <div className="settings-tabs" role="tablist" aria-label="Simulation settings sections" onKeyDown={event=>{const index=tabs.indexOf(tab);const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;if(next!==null){event.preventDefault();setTab(tabs[next]);document.getElementById(`settings-tab-${tabs[next]}`)?.focus();}}}>{tabs.map(id=><button type="button" key={id} role="tab"
      id={`settings-tab-${id}`} aria-selected={tab===id} tabIndex={tab===id?0:-1} aria-controls={`settings-${id}`} onClick={()=>setTab(id)}>{id==='production'?'Production & costs':id==='stress'?'Stress test':id==='stations'?'Station buffers':'Run results'}</button>)}</div>
    <form onSubmit={apply} className="settings-form">
      <div className="settings-content" role="tabpanel" id={`settings-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
        {tab==='production'&&<>
          <h3>Production plan</h3><div className="settings-fields">
            <label>Order count<input type="number" min="1" max="60" step="1" required value={value(draft.orderCount)} onChange={e=>numeric('orderCount',e.target.value)}/></label>
            <label>Run horizon<select value={draft.horizonDays} onChange={e=>setDraft({...draft,horizonDays:Number(e.target.value) as 90|366})}><option value="90">90 calendar days</option><option value="366">366 calendar days</option></select></label>
            <label>Release every (working days)<input type="number" min="1" max="20" step="1" required value={value(draft.releaseEveryWorkdays)} onChange={e=>numeric('releaseEveryWorkdays',e.target.value)}/></label>
            <label>Maximum WIP<input type="number" min="1" max="20" step="1" required value={value(draft.wipLimit)} onChange={e=>numeric('wipLimit',e.target.value)}/></label>
            <label>Staffing multiplier<input type="number" min="0.25" max="2" step="0.05" required value={value(draft.crewScale)} onChange={e=>numeric('crewScale',e.target.value)}/></label>
          </div><p className="settings-note">Staffing multiplier sets starting trade counts; explicit counts in Stress test take precedence. Inventory deliveries arrive every four releases.</p>
          <h3>Financial assumptions · USD</h3><div className="settings-fields">
            {([['laborPerHourCents','Scheduled labor / person-hour ($)'],['overtimePremiumPerHourCents','Overtime premium / person-hour ($)'],['carryingPerDayCents','WIP carrying / aircraft-day ($)'],['latenessPerDayCents','Lateness / aircraft-day ($)']] as const).map(([key,label])=><label key={key}>{label}<input type="number" min="0" max="10000000" step="0.01" required value={value(rates[key]/100)} onChange={e=>cost(key,e.target.value)}/></label>)}
            {Object.entries(rates.materialUnitCents).map(([sku,cents])=><label key={sku}>{materialCatalog[sku]?.label??sku} / unit ($)<input type="number" min="0" max="10000000" step="0.01" required value={value(cents/100)} onChange={e=>setDraft({...draft,costRates:{...rates,materialUnitCents:{...rates.materialUnitCents,[sku]:e.target.value===''?NaN:Math.round(Number(e.target.value)*100)}} as CostRates})}/></label>)}
          </div><p className="settings-note">Illustrative rates · {rates.version}. Default shifts are regular time; overtime premium applies only to scenario-designated overtime shifts. Changes apply after restart.</p>
        </>}
        {tab==='stress'&&<ScenarioDrawer base={draftBase} draft={scenario} onChange={next=>setDraft({...draft,scenario:next})}/>}
        {tab==='stations'&&<>
          <div className="settings-station-heading"><h3>Station residence & recovery time</h3><label>Buffer unit<select value={unit} onChange={e=>setUnit(e.target.value as 'hours'|'days')}><option value="hours">Staffed hours</option><option value="days">Staffed days · 15 hours</option></select></label></div>
          <p className="settings-note">One staffed day is 15 working hours across both shifts. Breaks, nights and weekends pause the buffer. Up to 30 staffed days per station; work durations can be scaled to represent a slower line.</p>
          <label className="settings-policy"><input type="checkbox" checked={draft.holdBuffers} onChange={e=>setDraft({...draft,holdBuffers:e.target.checked})}/><span>Keep products at each station for its buffer after work completes</span></label>
          <p className="settings-note">Enabled: buffers are minimum residence time, occupy the station and affect actual WIP, throughput and cost. Disabled: buffers are schedule allowance only; actual products leave as soon as space and resources are ready. A schedule allowance alone does not create a holding cost.</p>
          <div className="settings-stations"><table><thead><tr><th>Station</th><th>Buffer · {unit}</th><th>Work duration ×</th></tr></thead><tbody>{experimentStations.map(id=>{
            const station=draft.stations[id],divisor=unit==='days'?15:1,label=stationPoses[id]?.label??id;
            return <tr key={id}><th scope="row">{label}</th><td><input aria-label={`${label} buffer ${unit}`} type="number" min="0" max={unit==='days'?30:450} step="any" required
              value={value(station.bufferHours/divisor)} onChange={e=>setDraft({...draft,stations:{...draft.stations,[id]:{...station,bufferHours:e.target.value===''?NaN:Number(e.target.value)*divisor}}})}/></td>
              <td><input aria-label={`${label} work duration multiplier`} type="number" min="0.25" max="20" step="0.25" required value={value(station.workScale)}
                onChange={e=>setDraft({...draft,stations:{...draft.stations,[id]:{...station,workScale:e.target.value===''?NaN:Number(e.target.value)}}})}/></td></tr>;
          })}</tbody></table></div><p className="settings-note">Work multipliers change processing time, including elapsed cure and flight work; tow travel times stay physical. Packages longer than a staffed day span days instead of waiting forever for a same-day window.</p>
        </>}
        {tab==='results'&&<>
          <CostBreakdown config={client.config} events={view.history.events} cutoff={fleet?.instant??client.config.recipe.start} runId={view.runId}/>
          <p className="settings-note">Use Play to watch the factory advance. This optional action calculates the rest of the run to its horizon as a batch.</p>
          <div className="settings-run-actions"><button type="button" disabled={view.state==='starting'||view.state==='computing'||view.history.cursor!==null||!fleet?.nextEventInstant} onClick={()=>client.command('run')}>Calculate full horizon</button><button type="button" onClick={()=>client.play(false)}>Pause playback</button></div>
        </>}
      </div>
      <footer>{error&&<p role="alert" className="settings-error">{error}</p>}<span role="status">{changed?'Unapplied changes':'Draft matches applied scenario'}</span><div><button type="button" onClick={()=>{setDraft(settingsForConfig(client.config));setError('');}}>Discard edits</button><button type="button" onClick={()=>{setDraft(defaultSettings());setError('');}}>Default values</button><button className="settings-apply" type="submit">Apply settings & restart</button></div><small>A fresh run starts paused from {new Date(client.config.recipe.start).toLocaleDateString('en-US',{timeZone:client.config.recipe.calendar.timeZone})}. Close settings and press Play to watch it. Invalid drafts leave this run intact.</small></footer>
    </form>
  </section>;
}
