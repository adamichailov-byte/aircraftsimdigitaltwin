import type {FleetAircraft,FleetConfig,FleetSnapshot} from '../simulation/flow';
import {materialCatalog} from '../simulation/fixtures/a100';
import {useSyncExternalStore} from 'react';
import type {FleetClient} from '../simulation/client';
import {receivingQueue} from '../simulation/schedule';
const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

/** Compact inspection of the same committed ledger that gates task execution. */
export function Materials({fleet,aircraft,config,station,readOnly=false,onReceipt}:{fleet:FleetSnapshot;aircraft?:FleetAircraft;config:FleetConfig;station?:string;readOnly?:boolean;onReceipt:(at:number)=>void}){
  const tasks=aircraft?.tasks.filter(t=>t.stationId===station&&Object.keys(t.materialRequirements).length)??[];
  const stock=(sku:string)=>fleet.inventory.lots.filter(l=>l.sku===sku);
  const trace=fleet.inventory.reservations.filter(r=>r.serialId===aircraft?.id);
  const expected=(sku:string)=>{
    const receipts=config.materials.receipts.filter(r=>r.at>fleet.instant&&r.lot.sku===sku&&r.lot.quantity>r.lot.quarantined).sort((a,b)=>a.at-b.at);
    const first=receipts[0];if(!first)return undefined;
    const sameTime=receipts.filter(r=>r.at===first.at);
    return {at:first.at,quantity:sameTime.reduce((n,r)=>n+r.lot.quantity-r.lot.quarantined,0),lots:sameTime.length};
  };
  return <section className="materials-section" aria-label="Materials">
    <h3>Materials</h3>
    <p className="material-note">Receipts become usable after inspection, kitting and a forklift drop in central stores. Rack fill represents aggregate available stock; bay distribution is abstracted.</p>
    {fleet.admissionBlockers.length>0&&<p className="flow-blocker">Admission held: major-section kit unavailable.</p>}
    {tasks.length===0?<p className="material-note">No material issue required at this station.</p>:tasks.map(task=><div key={task.id} className="material-task">
      <h4>{task.label}</h4>
      <table><caption className="sr-only">Material quantities for {task.label}</caption><thead><tr><th>Part</th><th>Need</th><th>Avail.</th><th>Reserved</th><th>Issued</th></tr></thead>
        <tbody>{Object.entries(task.materialRequirements).map(([sku,needed])=>{
          const lots=stock(sku),reservation=trace.find(r=>r.taskId===task.id);
          const allocated=reservation?.allocations.filter(a=>a.sku===sku).reduce((n,a)=>n+a.quantity,0)??0;
          return <tr key={sku}><th>{materialCatalog[sku]?.label??sku}</th><td>{needed}</td><td>{lots.reduce((n,l)=>n+l.available,0)}</td><td>{reservation?.state==='reserved'?allocated:0}</td><td>{reservation?.state==='issued'?allocated:0}</td></tr>;
        })}</tbody></table>
      {Object.keys(task.materialRequirements).map(sku=>{
        const receipt=trace.some(r=>r.taskId===task.id&&r.state==='issued')?undefined:expected(sku),quarantine=stock(sku).reduce((n,l)=>n+l.quarantined,0);
        const handling=stock(sku).reduce((n,l)=>n+l.inHandling,0);
        return <div key={sku} className="material-note"><p>{[...new Set(stock(sku).map(l=>l.location))].join(' · ')||materialCatalog[sku]?.location||sku}{quarantine>0?` · ${quarantine} quarantined (unavailable)`:''}{handling>0?` · ${handling} awaiting handling (unavailable)`:''}</p>
          {receipt&&<p>Next dock arrival: {date.format(receipt.at)} · {receipt.quantity} units before handling ({receipt.lots} {receipt.lots===1?'lot':'lots'}){receipt.at>config.recipe.end?' · beyond run horizon':''}.
            <button disabled={readOnly||receipt.at>config.recipe.end} onClick={()=>onReceipt(receipt.at)}>{readOnly?'Return live to step':'Step to receipt'}</button></p>}
        </div>;
      })}
    </div>)}
  </section>;
}

export function LogisticsInspector({client,selectedId,onSelect,onClose,onFollow,onAircraft}:{client:FleetClient;selectedId:string;
  onSelect:(id:string)=>void;onClose:()=>void;onFollow:(id:string)=>void;onAircraft:(id:string)=>void}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot),fleet=view.displayFleet,readOnly=view.history.cursor!==null;
  const receipt=client.config.materials.receipts.find(r=>r.id===selectedId)??client.config.materials.receipts.find(r=>r.lot.sku==='engine')??client.config.materials.receipts[0];
  const job=fleet?.logistics.jobs.find(j=>j.id===receipt?.id),lot=fleet?.inventory.lots.find(l=>l.id===receipt?.lot.id);
  const busy=view.state==='starting'||view.state==='computing';
  const step=(at:number)=>{if(readOnly)return;client.play(false);client.advance(Math.min(at,client.config.recipe.end));};
  const next=fleet?.logistics.nextEventInstant??fleet?.nextEventInstant;
  const affected=fleet?.aircraft.filter(a=>a.tasks.some(t=>t.materialRequirements[receipt?.lot.sku??'']&&a.pilot.tasks.some(p=>p.taskId===t.id&&p.state==='waiting-material')));
  const queue=fleet?receivingQueue(client.config,fleet):[];
  const carrier=fleet?.logistics.jobs.find(j=>j.id===fleet.logistics.carrierId);
  const ready=queue.filter(q=>q.job&&!['complete','held'].includes(q.job.stage));
  const upcoming=queue.find(q=>!q.job);
  return <aside className="inspector task-inspector" aria-label="Receiving and kit delivery">
    <header className="inspector-heading"><div><span className="eyebrow">RECEIVING · FINITE HANDLING</span><h2>Kit delivery</h2></div><button aria-label="Close receiving" onClick={onClose}>Close</button></header>
    <section className="receiving-queue" aria-label="Receiving job queue">
      <h3>Forklift dispatch</h3>
      <p>{carrier?`${carrier.id} · ${carrier.stage} · ${carrier.state}`:ready.length?`Idle · ${ready.length} ${ready.length===1?'receipt is':'receipts are'} preparing or waiting. ${ready[0].job?.blockers.join(' · ')||'Inspection and kitting must finish before loading.'}`:
        upcoming?`Idle · next dock arrival ${date.format(upcoming.receipt.at)}. Opening stock does not need this receiving trip.`:'Idle · all scheduled receiving work is finished or held.'}</p>
      {carrier&&<button onClick={()=>onFollow(carrier.id)}>Follow current assignment</button>}
    </section>
    <label className="pilot-stage-select">Receipt<select aria-label="Receipt job" value={receipt?.id??''} onChange={e=>onSelect(e.target.value)}>
      {!receipt&&<option value="">No scheduled receipts</option>}{client.config.materials.receipts.map(r=><option key={r.id} value={r.id}>{r.id}</option>)}
    </select></label>
    {receipt?<>
      <p className="pilot-summary">{materialCatalog[receipt.lot.sku]?.label??receipt.lot.sku} · {receipt.lot.quantity} units · {receipt.lot.location}</p>
      <p className="material-note">Dock arrival {date.format(receipt.at)}. {receipt.inspectionNotBefore?`Inspection window ${date.format(receipt.inspectionNotBefore)}.`:''}</p>
      <div className={`handling-status${job?.blockers.length?' is-warning':''}`} role="status"><strong>{job?`${job.stage} · ${job.state}`:'Scheduled · not arrived'}</strong>
        {job?.blockers.map(reason=><p key={reason}>! {reason}</p>)}
      </div>
      <div className="handling-actions"><button disabled={!job||readOnly} onClick={()=>onFollow(receipt.id)}>Follow forklift / load</button>
        <button disabled={readOnly||busy||!fleet||!next||next>client.config.recipe.end} onClick={()=>next&&step(next)}>Next handling event</button>
        <button disabled={readOnly||busy||!fleet||fleet.instant>=client.config.recipe.end} onClick={()=>fleet&&step(fleet.instant+60000)}>Advance 1 minute</button>
        {!job&&<button disabled={readOnly||busy||receipt.at>client.config.recipe.end} onClick={()=>step(receipt.at)}>Step to dock arrival</button>}
      </div>
      {job&&<><progress aria-label="Current handling stage progress" max={job.durationMs} value={job.durationMs-job.remainingWorkMs}/>
        <p className="material-note">{(job.remainingWorkMs/60000).toFixed(1)} working minutes remaining in this stage · {job.crewCount} assigned logistics crew.</p></>}
      <dl className="handling-stock"><div><dt>Receipt units on hand</dt><dd>{lot?.onHand??0}</dd></div><div><dt>Awaiting handling</dt><dd>{lot?.inHandling??0}</dd></div>
        <div><dt>Usable from this lot</dt><dd>{lot?.available??0}</dd></div><div><dt>Issued from this lot</dt><dd>{lot?.consumed??0}</dd></div></dl>
      <p className="material-note">{job?.dropAt?`Usable drop completed ${date.format(job.dropAt)}. Stock can be issued at this same instant.`:'Arrival alone releases no stock. The unload completion releases usable quantities exactly once.'}</p>
      <ol className="handling-stages">{['inspection','kitting','loading','transit','unloading','returning'].map(stage=><li key={stage} aria-current={job?.stage===stage?'step':undefined}>
        <span>{stage}</span><small>{stage==='inspection'?'2 working hours · 2 crew':stage==='kitting'?'1 working hour · 1 crew':stage==='loading'||stage==='unloading'?'5 working minutes':stage==='transit'?'2 m/s · load stays attached':'Empty return · forklift remains reserved'}</small>
      </li>)}</ol>
      {affected?.map(a=><button className="handling-aircraft" key={a.id} onClick={()=>onAircraft(a.id)}>Inspect {a.id} · waiting for {receipt.lot.sku}</button>)}
      {job?.dropAt!=null&&fleet?.aircraft.filter(a=>a.pilot.tasks.some(t=>t.taskId==='engines'&&t.startedAt===job.dropAt)).map(a=><button className="handling-aircraft" key={a.id} onClick={()=>onAircraft(a.id)}>Inspect {a.id} · engine task started at drop</button>)}
    </>:<p className="material-note">Opening inventory is already usable. This run has no replenishment receipts.</p>}
  </aside>;
}
