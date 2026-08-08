import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
import { createWorld, stepWorld, leader } from '../sim.js';
import { render } from '../render.js';

// Headless canvas has no system font lookup — register one so the HUD is readable
// in screenshots. The browser uses its own ui-monospace stack and needs nothing.
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 'GaitMono');
const W = 1100, H = 620;
const targets = [0, 6, 20, 70];   // generations to capture
const world = createWorld();

for (const g of targets) {
  while (world.generation < g) { while (!stepWorld(world)); }
  // run part-way into the episode so the gait is mid-stride, not standing at t=0
  while (world.step < 380) stepWorld(world);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  render(ctx, world, W, H, { leader: leader(world) });
  const f = `shots/gen${String(g).padStart(3,'0')}.png`;
  writeFileSync(f, canvas.toBuffer('image/png'));
  const l = leader(world);
  console.log(`${f}  gen=${world.generation} fit=${(l.fitness).toFixed(0)} contact=${(l.contactFrac*100).toFixed(0)}% posture=${(l.postureFrac*100).toFixed(0)}%`);
}
