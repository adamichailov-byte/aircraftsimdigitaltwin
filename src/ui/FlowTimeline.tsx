import {useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import type {FleetClient} from '../simulation/client';
import {FLOW_STATIONS,buildFlowTimeline,calendarTicks,filterTimelineEvents,formatTimelineDuration} from './flow-timeline-data';
import type {TimelineSegment} from './flow-timeline-data';

const timeLabel=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const laneIndex=(id:string)=>FLOW_STATIONS.findIndex(station=>station.id===id);
const styles:Record<TimelineSegment['kind'],{stroke:string;dash?:string;width:number}>={
  productive:{stroke:'#A7C98A',width:3.2},blocked:{stroke:'#DF7D70',dash:'6 3',width:4.2},offshift:{stroke:'#A5A79F',dash:'1 4',width:3},
  transfer:{stroke:'#B9BDA8',dash:'',width:2.5},offsite:{stroke:'#D8AF63',dash:'2 2',width:3.2},delivery:{stroke:'#A7C98A',width:1},
};

export function FlowTimeline({client,onAircraft,selectedId,collapsed,setCollapsed}:{client:FleetClient;onAircraft:(id:string)=>void;selectedId:string|null;collapsed:boolean;setCollapsed:(collapsed:boolean)=>void}){
  const view=useSyncExternalStore(client.subscribe,client.getSnapshot),fleet=view.displayFleet,ledger=view.history;
  const [height,setHeight]=useState(250),[filter,setFilter]=useState('all'),[fitAll,setFitAll]=useState(false),[tableOpen,setTableOpen]=useState(false);
  const panel=useRef<HTMLElement>(null);
  const at=ledger.cursor??fleet?.instant??client.config.recipe.start;
  const checkpoints=ledger.checkpoints,index=ledger.cursor===null?Math.max(0,checkpoints.length-1):Math.max(0,checkpoints.findIndex(point=>point.instant===ledger.cursor));
  const windowStart=fitAll?client.config.recipe.start:Math.max(client.config.recipe.start,at-14*86400000);
  const windowEnd=Math.max(windowStart+6*3600000,at);
  const timeline=useMemo(()=>buildFlowTimeline({fleet,events:ledger.events,at,historical:ledger.cursor!==null,
    from:windowStart,to:windowEnd}),[client.config,fleet,ledger.events,at,ledger.cursor,windowStart,windowEnd]);
  const segments=useMemo(()=>filterTimelineEvents(timeline.segments,filter),[timeline.segments,filter]);
  const ticks=useMemo(()=>calendarTicks(windowStart,windowEnd,950),[windowStart,windowEnd]);
  const yFor=(station:string)=>{
    const index=laneIndex(station);return (FLOW_STATIONS.length-1-Math.max(0,index))*10+5;
  };
  const xFor=(instant:number)=>Math.max(0,Math.min(1000,(instant-windowStart)/(windowEnd-windowStart)*1000));
  const select=(segment:TimelineSegment)=>onAircraft(segment.serialId);
  const keySelect=(event:KeyboardEvent<SVGGElement>,segment:TimelineSegment)=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();select(segment);}
  };
  const resizeKey=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();setHeight(current=>Math.max(160,Math.min(360,current+(event.key==='ArrowUp'?16:-16))));}
  };
  const resizeStart=(event:PointerEvent<HTMLDivElement>)=>{
    if(collapsed)return;event.preventDefault();const startY=event.clientY,startHeight=height,element=event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const move=(pointer:globalThis.PointerEvent)=>setHeight(Math.max(160,Math.min(360,startHeight+startY-pointer.clientY)));
    const end=()=>{element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',end);element.removeEventListener('pointercancel',end);};
    element.addEventListener('pointermove',move);element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);
  };
  const cursorChange=(value:string)=>{const point=checkpoints[Number(value)];if(point)client.setHistoryCursor(point.instant);};
  const visibleAircraft=fleet?.aircraft.filter(aircraft=>aircraft.state!=='delivered')??[];
  const timeAtCursor=ledger.cursor===null?'Live edge':timeLabel.format(at);
  const heightStyle={height:collapsed?42:height};
  const drawSegment=(segment:TimelineSegment)=>{
    const x1=xFor(segment.start),x2=Math.max(x1+1,xFor(segment.end)),y1=yFor(segment.station),y2=segment.kind==='transfer'?yFor(segment.to??segment.station):y1;
    const style=styles[segment.kind],selected=segment.serialId===selectedId;
    const opacity=filter==='all'?0.82:1;
    const title=`${segment.serialId} · ${segment.label} · ${FLOW_STATIONS[laneIndex(segment.station)]?.label??segment.station} · ${timeLabel.format(segment.start)} → ${timeLabel.format(segment.end)} · ${formatTimelineDuration(segment.end-segment.start)} · ${segment.reason}`;
    return <g key={segment.id} role="button" tabIndex={0} aria-label={title} className={`flow-trace is-${segment.kind}`}
      onClick={()=>select(segment)} onKeyDown={event=>keySelect(event,segment)} opacity={selectedId===null?opacity:selected?1:0.2}>
      <title>{title}</title>
      {segment.kind==='delivery'?<path d={`M ${x1} ${y1-5} l 5 5 -5 5 -5 -5 Z`} fill={style.stroke} stroke="white" strokeWidth="1.2"/>
        :<line x1={x1} y1={y1} x2={x2} y2={y2} stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash}
          strokeLinecap={segment.kind==='offshift'?'round':'square'} vectorEffect="non-scaling-stroke"/>}
    </g>;
  };
  return <section ref={panel} className={`flow-timeline${collapsed?' is-collapsed':''}`} style={heightStyle} aria-label="Aircraft flow timeline">
    {!collapsed&&<div className="flow-resize" role="separator" aria-label="Resize flow timeline" aria-orientation="horizontal" aria-valuemin={160}
      aria-valuemax={360} aria-valuenow={height} tabIndex={0} onPointerDown={resizeStart} onKeyDown={resizeKey}><span/></div>}
    <header className="flow-heading"><div className="flow-title"><strong>Aircraft flow</strong><span>{timeAtCursor}{ledger.cursor!==null?' · historical':''}</span></div>
      {!collapsed&&<div className="flow-controls">
        <label className="flow-filter">Trace<select aria-label="Aircraft trace filter" value={filter} onChange={event=>setFilter(event.target.value)}>
          <option value="all">All aircraft</option>{visibleAircraft.map(aircraft=><option key={aircraft.id} value={aircraft.id}>{aircraft.id}</option>)}
        </select></label>
        <button onClick={()=>setFitAll(!fitAll)} aria-pressed={fitAll}>{fitAll?'Last 14 days':'Fit window'}</button>
        <button onClick={()=>setTableOpen(!tableOpen)} aria-expanded={tableOpen}>{tableOpen?'Timeline':`Activity table · ${segments.length}`}</button>
        {ledger.cursor!==null&&<button onClick={()=>client.returnToLive()}>Return to live</button>}
        <button className="flow-collapse" aria-label="Collapse aircraft flow" onClick={()=>setCollapsed(true)}>−</button>
      </div>}
      {collapsed&&<button className="flow-expand" onClick={()=>setCollapsed(false)} aria-expanded={false}>Show timeline <span>＋</span></button>}
    </header>
    {!collapsed&&<>
      <div className="flow-scrubber"><label htmlFor="flow-time-range">Recorded time</label>
        <input id="flow-time-range" aria-label="Select simulation history time" type="range" min="0" max={Math.max(0,checkpoints.length-1)} value={index}
          disabled={checkpoints.length<2} onChange={event=>cursorChange(event.target.value)}/>
        <time>{timeLabel.format(at)}</time>{ledger.cursor===null&&<span className="flow-live-dot">LIVE</span>}
      </div>
      {!tableOpen&&<div className="flow-chart-scroll">
        <div className="flow-chart">
          <div className="flow-lane-labels" aria-hidden="true">{FLOW_STATIONS.slice().reverse().map(station=><div key={station.id}>{station.label}</div>)}</div>
          <div className="flow-plot-wrap">
            <div className="flow-time-ticks" aria-hidden="true">{ticks.map(tick=><span key={tick.instant} style={{left:`${xFor(tick.instant)/10}%`}}>{tick.label}</span>)}</div>
            <svg className="flow-plot" viewBox={`0 0 1000 ${FLOW_STATIONS.length*10}`} preserveAspectRatio="none" role="img"
              aria-label={`Aircraft activity over time across ${FLOW_STATIONS.length} station lanes`}>
              {FLOW_STATIONS.map(station=><line key={station.id} x1="0" x2="1000" y1={yFor(station.id)} y2={yFor(station.id)} className="flow-lane"/>)}
              {ticks.map(tick=><line key={tick.instant} x1={xFor(tick.instant)} x2={xFor(tick.instant)} y1="0" y2={FLOW_STATIONS.length*15} className="flow-tick-line"/>)}
              <line x1={xFor(at)} x2={xFor(at)} y1="0" y2={FLOW_STATIONS.length*10} className="flow-cursor"/>
              {segments.map(drawSegment)}
            </svg>
          </div>
        </div>
      </div>}
      {tableOpen&&<div className="flow-event-table-scroll flow-event-table-is-open"><table><thead><tr><th>Aircraft</th><th>Station</th><th>Activity</th><th>Time</th><th>Duration</th><th>Issue / status</th></tr></thead><tbody>
        {segments.slice(0,2000).map(segment=><tr key={segment.id} className={segment.kind==='blocked'?'is-blocked':''}>
          <td><button onClick={()=>select(segment)}>{segment.serialId}</button></td>
          <td>{FLOW_STATIONS[laneIndex(segment.station)]?.label??segment.station}</td><td>{segment.label}</td>
          <td>{timeLabel.format(segment.start)} → {timeLabel.format(segment.end)}</td><td>{formatTimelineDuration(segment.end-segment.start)}</td><td>{segment.reason}</td>
        </tr>)}
      </tbody></table>{segments.length>2000&&<p>Showing first 2,000 activities; narrow the aircraft filter for more detail.</p>}</div>}
      {!tableOpen&&<div className="flow-legend" aria-label="Timeline activity key">
        <span className="is-productive"><i/>Working</span><span className="is-blocked"><i/>Held / behind plan</span>
        <span className="is-offshift"><i/>Off shift</span><span className="is-transfer"><i/>Tow / transfer</span>
        <span className="is-offsite"><i/>Offsite flight</span><span className="is-delivery"><i/>Delivered</span>
        <span className="flow-count">{segments.length} recorded segments · {visibleAircraft.length} active aircraft</span>
      </div>}
    </>}
  </section>;
}
