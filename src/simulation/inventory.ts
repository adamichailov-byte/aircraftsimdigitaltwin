export type MaterialLot={id:string;sku:string;location:string;quantity:number;quarantined:number};
export type MaterialReceipt={id:string;at:number;lot:MaterialLot;inspectionNotBefore?:number;held?:boolean};
export type InventoryPlan={initial:readonly MaterialLot[];receipts:readonly MaterialReceipt[]};
export type LotStock=MaterialLot&{opening:number;received:number;onHand:number;reserved:number;consumed:number;scrapped:number;available:number;inHandling:number;destination:string};
export type Allocation={lotId:string;sku:string;quantity:number};
export type MaterialPosting={id:string;kind:'material-received'|'material-delivered'|'material-reserved'|'material-issued'|'material-released';
  instant:number;serialId:string;taskId:string;receiptId?:string;allocations:readonly Allocation[];causeEventIds:readonly string[]};
export type MaterialReservation={key:string;serialId:string;taskId:string;state:'reserved'|'issued'|'cancelled';
  requirements:Readonly<Record<string,number>>;allocations:readonly Allocation[];eventId:string;issueId?:string};
export type InventorySnapshot={lots:readonly LotStock[];reservations:readonly MaterialReservation[];history:readonly MaterialPosting[]};
type Stock=Omit<LotStock,'available'> & {receiptEventId?:string};
function quantity(value:number){if(!Number.isSafeInteger(value)||value<0||value>100000)throw new RangeError('Invalid material quantity.');}
function validateLot(lot:MaterialLot){
  if(!lot.id||!lot.sku||!lot.location)throw new RangeError('Material lot needs an ID, SKU and location.');
  quantity(lot.quantity);quantity(lot.quarantined);
  if(lot.quarantined>lot.quantity)throw new RangeError('Quarantined quantity exceeds lot stock.');
}
/** FIFO lots, atomic reservations/issue and immutable projections. Quantities are
 * aggregate units. Fleet receipts stay unavailable until the handling job drops them. */
export class Inventory {
  readonly plan:InventoryPlan;
  private lots:Stock[]=[];
  private reservations=new Map<string,MaterialReservation>();
  private history:MaterialPosting[]=[];
  private cursor=0;
  private delivered=new Set<string>();
  private emit:(posting:MaterialPosting)=>string;
  constructor(plan:InventoryPlan,emit:(posting:MaterialPosting)=>string=posting=>posting.id){
    if(plan.initial.length>1000||plan.receipts.length>1000)throw new RangeError('Material plan exceeds1000 lots/receipts.');
    [...plan.initial,...plan.receipts.map(r=>r.lot)].forEach(validateLot);
    const ids=[...plan.initial,...plan.receipts.map(r=>r.lot)].map(l=>l.id);
    if(new Set(ids).size!==ids.length||new Set(plan.receipts.map(r=>r.id)).size!==plan.receipts.length)throw new RangeError('Duplicate lot or receipt ID.');
    if(plan.receipts.some(r=>!r.id||!Number.isSafeInteger(r.at)||(r.inspectionNotBefore!==undefined&&(!Number.isSafeInteger(r.inspectionNotBefore)||r.inspectionNotBefore<r.at))||(r.held!==undefined&&typeof r.held!=='boolean')))throw new RangeError('Invalid receipt time, hold or inspection window.');
    this.plan=Object.freeze({initial:Object.freeze(plan.initial.map(l=>Object.freeze({...l}))),
      receipts:Object.freeze(plan.receipts.map(r=>Object.freeze({...r,lot:Object.freeze({...r.lot})})).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id)))});
    this.emit=emit;
    this.lots=plan.initial.map(l=>({...l,opening:l.quantity,received:0,onHand:l.quantity,reserved:0,consumed:0,scrapped:0,inHandling:0,destination:l.location}));
  }
  private post(kind:MaterialPosting['kind'],instant:number,serialId:string,taskId:string,allocations:readonly Allocation[],causes:readonly string[]=[],receiptId?:string){
    const posting:MaterialPosting={id:`material-${this.history.length+1}`,kind,instant,serialId,taskId,allocations:allocations.map(a=>({...a})),causeEventIds:[...new Set(causes)],...(receiptId?{receiptId}:{})};
    const id=this.emit(posting);
    this.history.push(Object.freeze({...posting,id,allocations:Object.freeze(posting.allocations.map(a=>Object.freeze(a))),causeEventIds:Object.freeze([...posting.causeEventIds])}));return id;
  }
  receiveThrough(instant:number,deferHandling=false){
    while(this.plan.receipts[this.cursor]?.at<=instant){
      const r=this.plan.receipts[this.cursor++];
      const needsHandling=deferHandling||r.held===true;
      const eventId=this.post('material-received',r.at,'','',[{lotId:r.lot.id,sku:r.lot.sku,quantity:r.lot.quantity}],[],r.id);
      this.lots.push({...r.lot,location:needsHandling?'Receiving dock':r.lot.location,destination:r.lot.location,
        opening:0,received:r.lot.quantity,onHand:r.lot.quantity,reserved:0,consumed:0,scrapped:0,
        inHandling:needsHandling?r.lot.quantity-r.lot.quarantined:0,receiptEventId:eventId});
    }
  }
  deliver(receiptId:string,instant:number,cause:string){
    const receipt=this.plan.receipts.find(r=>r.id===receiptId),lot=this.lots.find(l=>l.id===receipt?.lot.id);
    if(!receipt||!lot||receipt.held||this.delivered.has(receiptId))return null;
    const eventId=this.post('material-delivered',instant,'','',[{lotId:lot.id,sku:lot.sku,quantity:lot.onHand}],
      [lot.receiptEventId!,cause],receiptId);
    lot.location=lot.destination;lot.inHandling=0;lot.receiptEventId=eventId;this.delivered.add(receiptId);return eventId;
  }
  nextReceipt(after:number){return this.plan.receipts.find(r=>r.at>after)?.at??null;}
  available(sku:string,key?:string){
    const own=this.reservations.get(key??'');
    return this.lots.filter(l=>l.sku===sku).reduce((n,l)=>n+l.onHand-l.reserved-l.quarantined-l.inHandling,0)
      +(own?.state==='reserved'?own.allocations.filter(a=>a.sku===sku).reduce((n,a)=>n+a.quantity,0):0);
  }
  missing(key:string,requirements:Readonly<Record<string,number>>){
    if(this.reservations.get(key)?.state==='issued')return [];
    return Object.entries(requirements).filter(([sku,n])=>this.available(sku,key)<n).map(([sku,n])=>`Waiting for material · ${sku} · need ${n}, available ${this.available(sku,key)}`);
  }
  reserve(key:string,serialId:string,taskId:string,requirements:Readonly<Record<string,number>>,instant:number){
    for(const n of Object.values(requirements)){quantity(n);if(n===0)throw new RangeError('Task demand must be positive.');}
    const existing=this.reservations.get(key);
    if(existing&&existing.state!=='cancelled'){
      if(JSON.stringify(existing.requirements)!==JSON.stringify(requirements))throw new RangeError('Reservation demand changed.');
      return true;
    }
    if(this.missing(key,requirements).length)return false;
    const allocations:Allocation[]=[];
    for(const [sku,n] of Object.entries(requirements)){
      let remaining=n;
      for(const l of this.lots.filter(l=>l.sku===sku)){
        const take=Math.min(remaining,l.onHand-l.reserved-l.quarantined-l.inHandling);
        if(take>0)allocations.push({lotId:l.id,sku,quantity:take});remaining-=take;if(!remaining)break;
      }
    }
    for(const a of allocations)this.lots.find(l=>l.id===a.lotId)!.reserved+=a.quantity;
    const causes=allocations.flatMap(a=>this.lots.find(l=>l.id===a.lotId)!.receiptEventId??[]);
    const eventId=this.post('material-reserved',instant,serialId,taskId,allocations,causes);
    this.reservations.set(key,{key,serialId,taskId,state:'reserved',requirements:{...requirements},allocations,eventId});return true;
  }
  issue(key:string,instant:number){
    const r=this.reservations.get(key);if(!r||r.state==='cancelled')return null;if(r.state==='issued')return r.issueId!;
    for(const a of r.allocations){const l=this.lots.find(l=>l.id===a.lotId)!;l.reserved-=a.quantity;l.onHand-=a.quantity;l.consumed+=a.quantity;}
    const issueId=this.post('material-issued',instant,r.serialId,r.taskId,r.allocations,[r.eventId]);
    this.reservations.set(key,{...r,state:'issued',issueId});return issueId;
  }
  cancel(key:string,instant:number){
    const r=this.reservations.get(key);if(!r||r.state!=='reserved')return false;
    for(const a of r.allocations)this.lots.find(l=>l.id===a.lotId)!.reserved-=a.quantity;
    this.post('material-released',instant,r.serialId,r.taskId,r.allocations,[r.eventId]);
    this.reservations.set(key,{...r,state:'cancelled'});return true;
  }
  snapshot():InventorySnapshot{return {lots:this.lots.map(({receiptEventId:_receipt,...l})=>({...l,available:l.onHand-l.reserved-l.quarantined-l.inHandling})),
    reservations:[...this.reservations.values()].map(r=>({...r,requirements:{...r.requirements},allocations:r.allocations.map(a=>({...a}))})),history:[...this.history]};}
}
