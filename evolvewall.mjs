import { createWorld, stepWorld, addObstacle, clearObstacles } from './sim.js';
for (const [label, n] of [['no block', 0], ['1 block (24px)', 1], ['2 stacked (48px)', 2]]) {
  clearObstacles();
  for (let k = 0; k < n; k++) addObstacle(260);
  if (n === 2) { const { obstacles } = await import('./sim.js'); obstacles[1].y -= 24; }
  const w = createWorld();
  while (w.generation < 70) { while (!stepWorld(w)); }
  const h = w.history;
  const early = h.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const late = h.slice(-5).reduce((a, b) => a + b, 0) / 5;
  console.log(`${label.padEnd(17)} gen5=${early.toFixed(0).padStart(4)}  gen70=${late.toFixed(0).padStart(4)}  x${(late/Math.max(early,1)).toFixed(1)}`);
}
