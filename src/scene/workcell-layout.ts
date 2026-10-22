import {fixtures} from '../demo/entities.ts';
import {bays} from '../demo/campus.ts';
import {simulationFixture} from '../simulation/transfers.ts';

// Existing, clearance-tested rack lines are the workcell anchors.
export const workcellLayout=[...bays.map(b=>({id:b.id,label:`BAY ${b.number}`})),{id:'paint',label:'PAINT'},
  {id:'flightline',label:'ACCEPTANCE'},{id:'delivery',label:'DELIVERY 01'},{id:'delivery-2',label:'DELIVERY 02'}].map(cell=>{
  const racks=fixtures.filter(f=>f.zoneId===cell.id&&f.kind==='rack').map(simulationFixture);
  const x=racks.length?racks.reduce((n,f)=>n+f.positionM[0],0)/racks.length:cell.id==='flightline'?280:cell.id.startsWith('delivery')?470:104;
  const z=racks[0]?.positionM[2]??(cell.id==='delivery-2'?415:cell.id==='flightline'||cell.id==='delivery'?325:3);
  return {...cell,racks,x,z};
});
