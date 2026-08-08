import { createWorld, stepWorld, EPISODE_STEPS, N_PARAMS, POP_SIZE } from './sim.js';
console.log(`params/genome: ${N_PARAMS}   pop: ${POP_SIZE}   steps/episode: ${EPISODE_STEPS}`);
const t0 = Date.now();
const w = createWorld();
const GENS = 60;
while (w.generation < GENS) { while (!stepWorld(w)); }
const dt = (Date.now() - t0) / 1000;
const h = w.history;
console.log(`\n${GENS} generations in ${dt.toFixed(1)}s  (${(dt/GENS*1000).toFixed(0)}ms/gen)`);
console.log('gen : best distance (px)');
for (let g = 0; g < h.length; g += 5) console.log(`  ${String(g).padStart(3)} : ${h[g].toFixed(1)}`);
console.log(`  ${String(h.length-1).padStart(3)} : ${h[h.length-1].toFixed(1)}`);
console.log(`\nbestEver: ${w.bestEver.toFixed(1)}px`);
const early = h.slice(0,5).reduce((a,b)=>a+b,0)/5;
const late  = h.slice(-5).reduce((a,b)=>a+b,0)/5;
console.log(`mean first 5 gens: ${early.toFixed(1)}  |  mean last 5: ${late.toFixed(1)}  |  improvement: ${(late-early).toFixed(1)}px`);
