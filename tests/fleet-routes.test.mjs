import test from 'node:test';
import assert from 'node:assert/strict';
import {fleetBuildings,fleetRoutes} from '../src/simulation/flow.ts';
import {stationPoses,transferPose,simulationFixture} from '../src/simulation/transfers.ts';
import {fixtures} from '../src/demo/entities.ts';

function overlaps(x,z,c,s,hx,hz,o){const dx=o.x-x,dz=o.z-z;return Math.abs(dx)<=o.hx+hx&&Math.abs(dz)<=o.hz+hz
  &&Math.abs(c*dx-s*dz)<=o.planeX+o.hx*Math.abs(c)+o.hz*Math.abs(s)
  &&Math.abs(s*dx+c*dz)<=o.planeZ+o.hx*Math.abs(s)+o.hz*Math.abs(c);}

test('fleet exterior bypass and intake routes clear parked aircraft, actual walls, doors and staging',()=>{
  const hall=fleetBuildings.find(b=>b.id==='assembly');
  const sideBuildings=fleetBuildings.filter(b=>b.id!=='assembly');
  for(const id of ['bay-3-to-4',...['queue-1','queue-2','queue-3'].map(q=>`${q}-to-bay-1`)]){
    const r=fleetRoutes[id],small=id.startsWith('queue-'),planeX=34,planeZ=small?6:29.2;
    const obstacles=sideBuildings.map(b=>({id:b.id,x:b.centerM[0],z:b.centerM[1],hx:b.lengthM/2,hz:b.widthM/2}));
    for(const f of fixtures.map(simulationFixture))obstacles.push({id:f.id,x:f.positionM[0],z:f.positionM[2],hx:f.sizeM[0]/2+(f.kind==='platform'?6:0),hz:f.sizeM[2]/2+(f.kind==='platform'?3.4:0)});
    for(const [slot,p] of Object.entries(stationPoses))if(slot!==r.fromStation&&slot!==r.toStation&&slot!=='departed'){
      const q=slot.startsWith('queue-');obstacles.push({id:`parked-${slot}`,x:p.position[0],z:p.position[1],hx:q?32:30,hz:q?4:27.2});
    }
    for(let t=0;t<=r.durationMs;t+=250){
      const pose=transferPose(r,t),[x,,z]=pose.positionM,c=Math.cos(pose.heading),s=Math.sin(pose.heading),hx=Math.abs(c)*planeX+Math.abs(s)*planeZ,hz=Math.abs(s)*planeX+Math.abs(c)*planeZ;
      for(const o of obstacles)assert.equal(overlaps(x,z,c,s,hx,hz,{...o,planeX,planeZ}),false,`${id} ${o.id} at ${x},${z}`);
      if(z-hz<-250&&z+hz>-250&&x+hx>-260&&x-hx<180){
        const door=hall.northDoor;assert.ok(x-hx>=hall.centerM[0]+door.centerOffsetM-door.widthM/2&&x+hx<=hall.centerM[0]+door.centerOffsetM+door.widthM/2,`${id} north door`);
      }
      if(x-hx<-260&&x+hx>-260&&z+hz>-250&&z-hz<190){
        const door=hall.westDoor;assert.ok(z-hz>=hall.centerM[1]+door.centerOffsetM-door.widthM/2&&z+hz<=hall.centerM[1]+door.centerOffsetM+door.widthM/2,`${id} west door`);
      }
    }
  }
  assert.ok(hall.northDoor.heightM>17.7);assert.ok(hall.westDoor.heightM>17.7);
});
