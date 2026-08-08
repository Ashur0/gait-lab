import { createWorld, stepWorld, createCreature, stepCreature, addObstacle,
         clearObstacles, obstacles, _internals } from './sim.js';

// Train briefly on clear ground, then drop a wall in the champion's path.
const w = createWorld();
while (w.generation < 30) { while (!stepWorld(w)); }
const genome = w.bestGenome;

function runTo(steps) {
  const c = createCreature(genome);
  let maxPen = 0;
  for (let i = 0; i < steps; i++) {
    stepCreature(c);
    for (const b of obstacles) {
      for (let n = 0; n < c.x.length; n++) {
        if (c.x[n] > b.x && c.x[n] < b.x + b.w && c.y[n] > b.y && c.y[n] < b.y + b.h) {
          maxPen = Math.max(maxPen, Math.min(c.y[n] - b.y, b.x + b.w - c.x[n], c.x[n] - b.x));
        }
      }
    }
  }
  return { dist: _internals.centreX(c) - c.startX, maxPen, alive: c.alive };
}

clearObstacles();
const clear = runTo(600);
console.log(`no blocks : travelled ${clear.dist.toFixed(0)}px  alive=${clear.alive}`);

// A wall of three stacked blocks, 250px ahead of the start.
for (let k = 0; k < 3; k++) addObstacle(250);
obstacles.forEach((b, i) => { b.y -= i * 24; });
const walled = runTo(600);
console.log(`3-high wall at x=250 : travelled ${walled.dist.toFixed(0)}px  alive=${walled.alive}`);
console.log(`max penetration into any block: ${walled.maxPen.toFixed(2)}px  (want ~0 => solid)`);
console.log(walled.dist < clear.dist * 0.85 ? 'BLOCKED as expected' : 'wall had little effect');
