import { createCreature, stepCreature, _internals } from './sim.js';
const g = new Float64Array(200); // all-zero genome = no actuation, just settle
const c = createCreature(g);
for (let i=0;i<400;i++) stepCreature(c);
console.log('settled COM y =', _internals.centreY(c).toFixed(2), ' alive =', c.alive);
