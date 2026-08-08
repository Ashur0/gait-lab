import { createWorld, stepWorld, createCreature, stepCreature, _internals } from './sim.js';
const w = createWorld();
while (w.generation < 40) { while (!stepWorld(w)); }
const c = createCreature(w.bestGenome);
const trace = [];
for (let i = 0; i < 300; i++) {
  stepCreature(c);
  if (i % 10 === 0) trace.push({
    t: i,
    x: _internals.centreX(c).toFixed(0),
    y: _internals.centreY(c).toFixed(1),
    f4: c.grounded[4], f5: c.grounded[5],
    head: c.y[0].toFixed(1),
    alive: c.alive,
  });
}
console.log(' t    cx     cy    head  frontFoot rearFoot');
for (const r of trace) console.log(
  String(r.t).padStart(3), String(r.x).padStart(6), String(r.y).padStart(7),
  String(r.head).padStart(7), '   ', r.f4, '        ', r.f5, r.alive?'':'  DEAD');
const vx = [];
const c2 = createCreature(w.bestGenome);
let last = _internals.centreX(c2);
for (let i=0;i<300;i++){ stepCreature(c2); const n=_internals.centreX(c2); vx.push(n-last); last=n; }
const mean = vx.reduce((a,b)=>a+b,0)/vx.length;
console.log(`\nmean vx: ${mean.toFixed(2)} px/step   max vx: ${Math.max(...vx).toFixed(2)}   min vx: ${Math.min(...vx).toFixed(2)}`);
