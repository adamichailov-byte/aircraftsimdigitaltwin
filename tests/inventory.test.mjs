import test from 'node:test';
import assert from 'node:assert/strict';
import {Inventory} from '../src/simulation/inventory.ts';

const initial=[{id:'open',sku:'engine',location:'Engine rack · Bay04',quantity:1,quarantined:0}];
const plan=()=>({initial,receipts:[{id:'R1',at:100,lot:{id:'new',sku:'engine',location:'Engine rack · Bay04',quantity:2,quarantined:1}}]});
test('held receipts cannot bypass quality release even through direct inventory reception',()=>{
  const p=plan(),inv=new Inventory({...p,initial:[],receipts:p.receipts.map(r=>({...r,held:true}))});
  inv.receiveThrough(100);assert.equal(inv.available('engine'),0);
  assert.equal(inv.deliver('R1',100,'inspection'),null);
  assert.equal(inv.reserve('A/e','A','e',{engine:1},100),false);
});
function balance(inv){for(const l of inv.snapshot().lots){
  assert.equal(l.opening+l.received,l.onHand+l.consumed+l.scrapped);
  assert.ok(l.reserved+l.quarantined<=l.onHand);assert.ok(l.available>=0);
}}
test('atomic material allocation waits for a full pair, excludes quarantine, and issues once',()=>{
  const inv=new Inventory(plan());
  assert.equal(inv.reserve('A/engines','A','engines',{engine:2},0),false);
  assert.equal(inv.snapshot().lots[0].reserved,0);
  inv.receiveThrough(100);assert.equal(inv.reserve('A/engines','A','engines',{engine:2},100),true);
  assert.equal(inv.reserve('B/engines','B','engines',{engine:1},100),false);
  const issue=inv.issue('A/engines',100);assert.ok(issue);
  assert.equal(inv.issue('A/engines',200),issue);assert.equal(inv.cancel('A/engines',200),false);
  assert.equal(inv.snapshot().lots.reduce((n,l)=>n+l.consumed,0),2);
  assert.equal(inv.snapshot().lots[1].quarantined,1);balance(inv);
});
test('multi-SKU reservations are all-or-none, cancel releases unissued lots, zero receipts are real',()=>{
  const config={initial:[...initial,{id:'join',sku:'join-kit',location:'Stores',quantity:1,quarantined:0}],
    receipts:[{id:'zero',at:100,lot:{id:'empty',sku:'engine',location:'Rack',quantity:0,quarantined:0}}]};
  const inv=new Inventory(config);
  assert.equal(inv.reserve('A/t','A','t',{engine:1,'join-kit':2},0),false);
  assert.equal(inv.snapshot().lots[0].reserved,0);
  assert.ok(inv.reserve('A/t','A','t',{engine:1},0));assert.ok(inv.cancel('A/t',1));
  assert.ok(inv.reserve('B/t','B','t',{engine:1},1));inv.receiveThrough(100);inv.receiveThrough(100);
  assert.equal(inv.snapshot().history.filter(e=>e.kind==='material-received').length,1);
  assert.equal(inv.snapshot().lots.reduce((n,l)=>n+l.received,0),0);balance(inv);
  assert.throws(()=>new Inventory({...config,initial:[{...initial[0],quantity:-1}]}),/quantity/i);
  assert.throws(()=>new Inventory({...config,receipts:[{...config.receipts[0],lot:{...initial[0],id:'bad',quantity:-2}}]}),/quantity/i);
  assert.throws(()=>new Inventory({...config,initial:[{...initial[0],quarantined:2}]}),/quarantin/i);
  const fresh=new Inventory(config);assert.equal(fresh.snapshot().lots[0].available,1);
  assert.equal(fresh.snapshot().history.length,0);
});
