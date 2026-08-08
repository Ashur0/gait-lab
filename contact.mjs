import { createWorld, stepWorld, createCreature, stepCreature, _internals } from './sim.js';
const w = createWorld();
while (w.generation < 40) { while (!stepWorld(w)); }
const c = createCreature(w.bestGenome);
let contact=0, both=0, air=0, n=600, ys=[], maxY=-1e9, minY=1e9;
for (let i=0;i<n;i++){
  stepCreature(c);
  const g4=c.grounded[4], g5=c.grounded[5];
  if (g4||g5) contact++; else air++;
  if (g4&&g5) both++;
  const cy=_internals.centreY(c); ys.push(cy);
  if(cy>maxY)maxY=cy; if(cy<minY)minY=cy;
}
console.log(`ground contact : ${(contact/n*100).toFixed(1)}% of frames`);
console.log(`both feet down : ${(both/n*100).toFixed(1)}%`);
console.log(`fully airborne : ${(air/n*100).toFixed(1)}%`);
console.log(`COM y range    : ${minY.toFixed(1)} (highest) .. ${maxY.toFixed(1)} (lowest)   [standing rest ~ -29]`);
console.log(`alive at end   : ${c.alive}`);
console.log(`distance       : ${(_internals.centreX(c)-c.startX).toFixed(0)}px over ${n} steps = ${((_internals.centreX(c)-c.startX)/n).toFixed(2)} px/step`);
console.log(`body length    : ~44px  =>  ${(((_internals.centreX(c)-c.startX)/n)/44*60).toFixed(1)} body-lengths/sec at 60fps`);
