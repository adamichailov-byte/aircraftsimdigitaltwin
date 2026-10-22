import {useRef,useState} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import type {FleetConfig} from '../simulation/flow';
import type {ScenarioDraft} from '../simulation/scenario';
import {materialCatalog} from '../simulation/fixtures/a100';
import {experimentStations} from '../simulation/experiments';
import {stationPoses} from '../simulation/transfers';

const tabs=['Supply','Advanced','Calendar'] as const;
const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const time=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const minutes=(text:string)=>{if(!text)return NaN;const [h,m]=text.split(':').map(Number);return h*60+m;};
const value=(n:number)=>Number.isFinite(n)?n:'';
const local=(at:number,zone:string)=>Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(zone).toPlainDateTime().toString().slice(0,16);

/** Draft controls only. This component never touches a worker or an applied configuration. */
export function ScenarioDrawer({base,draft,onChange}:{base:FleetConfig;draft:ScenarioDraft;onChange:(next:ScenarioDraft)=>void}){
  const [tab,setTab]=useState<typeof tabs[number]>('Supply'),refs=useRef<(HTMLButtonElement|null)[]>([]);
  const receipts=base.materials.receipts.filter(r=>r.lot.sku===draft.supply.sku),selected=receipts.find(r=>r.id===draft.supply.receiptId);
  const zone=base.recipe.calendar.timeZone,stamp=new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const arrival=selected&&Number.isInteger(draft.supply.delayDays)&&draft.supply.delayDays>=0&&draft.supply.delayDays<=30
    ?Temporal.Instant.fromEpochMilliseconds(selected.at).toZonedDateTimeISO(zone).add({days:draft.supply.delayDays}).epochMilliseconds:null;
  const supply=(patch:Partial<ScenarioDraft['supply']>)=>onChange({...draft,supply:{...draft.supply,...patch}});
  const shiftChange=(index:number,patch:Partial<ScenarioDraft['calendar']['shifts'][number]>)=>onChange({...draft,calendar:{...draft.calendar,shifts:draft.calendar.shifts.map((shift,i)=>i===index?{...shift,...patch}:shift)}});
  return <section className="scenario-controls" aria-label="Stress test draft">
    <div className="scenario-subtabs" role="tablist" aria-label="Stress test sections">{tabs.map((name,index)=><button type="button" key={name} role="tab" ref={node=>{refs.current[index]=node;}} id={`stress-tab-${index}`} aria-controls="stress-content" aria-selected={tab===name} tabIndex={tab===name?0:-1} onClick={()=>setTab(name)} onKeyDown={e=>{
      const next=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:null;
      if(next!==null){e.preventDefault();e.stopPropagation();setTab(tabs[next]);refs.current[next]?.focus();}
    }}>{name}</button>)}</div>
    <div id="stress-content" role="tabpanel" aria-labelledby={`stress-tab-${tabs.indexOf(tab)}`}>
      {tab==='Supply'&&<>
        <h3>Inventory deliveries</h3><div className="settings-fields">
          <label>Part / kit<select value={draft.supply.sku} onChange={e=>supply({sku:e.currentTarget.value,receiptId:base.materials.receipts.find(r=>r.lot.sku===e.currentTarget.value)?.id??''})}>{Object.entries(materialCatalog).map(([sku,part])=><option key={sku} value={sku}>{part.label}</option>)}</select></label>
          <label>Scheduled inventory delivery<select value={draft.supply.receiptId} onChange={e=>supply({receiptId:e.currentTarget.value})}><option value="">No delivery selected</option>{receipts.map(receipt=><option key={receipt.id} value={receipt.id}>{stamp.format(receipt.at)} · {receipt.lot.quantity} units</option>)}</select></label>
          <label>Delivery delay (calendar days · 0–30)<input type="number" min="0" max="30" step="1" required value={value(draft.supply.delayDays)} onChange={e=>supply({delayDays:e.currentTarget.value===''?NaN:Number(e.currentTarget.value)})}/></label>
          <label>Delivery quantity (% · 0–200)<input type="number" min="0" max="200" step="1" required value={value(draft.supply.quantityPercent)} onChange={e=>supply({quantityPercent:e.currentTarget.value===''?NaN:Number(e.currentTarget.value)})}/></label>
          <label>Reproducible seed (0–2147483647)<input type="number" min="0" max="2147483647" step="1" required value={value(draft.seed)} onChange={e=>onChange({...draft,seed:e.currentTarget.value===''?NaN:Number(e.currentTarget.value)})}/></label>
        </div>
        <p className="settings-note">{selected?`${materialCatalog[selected.lot.sku]?.label??selected.lot.sku} delivery: ${selected.lot.quantity} → ${Number.isFinite(draft.supply.quantityPercent)?Math.round(selected.lot.quantity*draft.supply.quantityPercent/100):'—'} units. Arrival ${stamp.format(selected.at)} → ${arrival!==null?stamp.format(arrival):'—'}. `:'No delivery selected. '}{base.materials.initial.filter(l=>l.sku===draft.supply.sku).reduce((n,l)=>n+l.quantity,0)} units of starting inventory stay unchanged.</p>
      </>}
      {tab==='Advanced'&&<>
        <h3>People per shift · 0–48 in each trade</h3><div className="results-table-scroll"><table><thead><tr><th>Trade</th>{Object.keys(base.resources.crewsByShift).map(shift=><th key={shift}>{shift}</th>)}</tr></thead><tbody>{Object.keys(base.resources.crewsByShift['Shift 1']).map(pool=><tr key={pool}><th scope="row">{pool}</th>{Object.entries(base.resources.crewsByShift).map(([shift,pools])=><td key={shift}><input aria-label={`${shift} ${pool} people`} type="number" min="0" max="48" step="1" required value={value(draft.crews[shift]?.[pool]??pools[pool])} onChange={e=>onChange({...draft,crews:{...draft.crews,[shift]:{...draft.crews[shift],[pool]:e.currentTarget.value===''?NaN:Number(e.currentTarget.value)}}})}/></td>)}</tr>)}</tbody></table></div>
        <h3>Additional task-time factors · 0.5–2×</h3><div className="results-table-scroll"><table><thead><tr><th>Station</th><th>Work duration ×</th></tr></thead><tbody>{experimentStations.map(id=><tr key={id}><th scope="row">{stationPoses[id]?.label??id}</th><td><input aria-label={`${id} stress time factor`} type="number" min="0.5" max="2" step="0.05" required value={value(draft.factors[id]??1)} onChange={e=>onChange({...draft,factors:{...draft.factors,[id]:e.currentTarget.value===''?NaN:Number(e.currentTarget.value)}})}/></td></tr>)}</tbody></table></div>
        <h3>Inspection and equipment</h3><label className="scenario-probability">Inspection failure (% · 0–30, at most 2 repair cycles)<input type="number" min="0" max="30" step="1" required value={value(draft.failureProbability*100)} onChange={e=>onChange({...draft,failureProbability:e.currentTarget.value===''?NaN:Number(e.currentTarget.value)/100})}/></label>
        <label className="settings-policy"><input type="checkbox" checked={draft.outage!==null} onChange={e=>onChange({...draft,outage:e.currentTarget.checked?{equipmentId:'wing-crane',start:local(base.recipe.start+2*86400000,zone),end:local(base.recipe.start+3*86400000,zone)}:null})}/><span>Schedule an equipment outage</span></label>
        {draft.outage&&<div className="settings-fields"><label>Equipment<select value={draft.outage.equipmentId} onChange={e=>onChange({...draft,outage:{...draft.outage!,equipmentId:e.currentTarget.value}})}>{Object.keys(base.resources.equipment).map(id=><option key={id} value={id}>{id.replaceAll('-',' ')}</option>)}</select></label>
          <label>Outage starts · plant time<input type="datetime-local" min={local(base.recipe.start,zone)} max={local(base.recipe.end,zone)} required value={draft.outage.start} onInput={e=>onChange({...draft,outage:{...draft.outage!,start:e.currentTarget.value}})}/></label>
          <label>Outage ends · plant time<input type="datetime-local" min={local(base.recipe.start,zone)} max={local(base.recipe.end,zone)} required value={draft.outage.end} onInput={e=>onChange({...draft,outage:{...draft.outage!,end:e.currentTarget.value}})}/></label></div>}
      </>}
      {tab==='Calendar'&&<>
        <h3>Plant calendar · {zone}</h3>{draft.calendar.shifts.map((shift,index)=><fieldset className="scenario-shift" key={shift.label}><legend>{shift.label}</legend>
          <div className="scenario-weekdays">{weekdays.map((day,i)=><label key={day}><input type="checkbox" aria-label={`${shift.label} ${day}`} checked={shift.weekdays.includes(i+1)} onChange={e=>shiftChange(index,{weekdays:e.currentTarget.checked?[...shift.weekdays,i+1].sort():shift.weekdays.filter(d=>d!==i+1)})}/>{day}</label>)}</div>
          <div className="settings-fields"><label>{shift.label} starts<input type="time" required value={Number.isFinite(shift.startMinute)?time(shift.startMinute):''} onInput={e=>shiftChange(index,{startMinute:minutes(e.currentTarget.value)})}/></label><label>{shift.label} ends<input type="time" required value={Number.isFinite(shift.endMinute)?time(shift.endMinute):''} onInput={e=>shiftChange(index,{endMinute:minutes(e.currentTarget.value)})}/></label>
          <label>{shift.label} break starts<input type="time" required value={shift.breaks[0]&&Number.isFinite(shift.breaks[0].startMinute)?time(shift.breaks[0].startMinute):''} onInput={e=>shiftChange(index,{breaks:[{...shift.breaks[0],startMinute:minutes(e.currentTarget.value)}]})}/></label><label>{shift.label} break ends<input type="time" required value={shift.breaks[0]&&Number.isFinite(shift.breaks[0].endMinute)?time(shift.breaks[0].endMinute):''} onInput={e=>shiftChange(index,{breaks:[{...shift.breaks[0],endMinute:minutes(e.currentTarget.value)}]})}/></label></div>
        </fieldset>)}
        <label className="scenario-closed">Closed dates (YYYY-MM-DD, comma separated)<textarea rows={2} maxLength={5000} value={draft.calendar.excludedDates.join(', ')} onChange={e=>onChange({...draft,calendar:{...draft.calendar,excludedDates:e.currentTarget.value.split(/[,\n]/).map(s=>s.trim()).filter(Boolean)}})}/></label>
      </>}
    </div>
  </section>;
}
