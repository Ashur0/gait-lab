/**
 * Gait Lab — renderer.
 *
 * Takes any 2D context (browser canvas OR @napi-rs/canvas in Node) so the exact
 * code that ships is the code I screenshot headlessly while building.
 *
 * Visual language is deliberately instrument-like: paper-white ground, hairline
 * grid, one accent colour, monospace numerals. The subject is strange enough that
 * the presentation should be calm.
 */

// Mutable so the page can hand us a dark palette; the canvas must not stay a white
// slab when the viewer's theme is dark.
let INK = '#12151a';
let MUTED = '#8b939c';
let HAIRLINE = '#e4e7e9';
let PAPER = '#fbfbf9';
let ACCENT = '#c8452e'; // contraction
let ACCENT2 = '#2f6f8f'; // extension

export function setPalette(p) {
  INK = p.ink; MUTED = p.muted; HAIRLINE = p.hairline;
  PAPER = p.paper; ACCENT = p.contract; ACCENT2 = p.extend;
}

const MONO = '11px GaitMono, ui-monospace, Menlo, Consolas, monospace';
const MONO_SM = '9px GaitMono, ui-monospace, Menlo, Consolas, monospace';
const MONO_LG = '26px GaitMono, ui-monospace, Menlo, Consolas, monospace';

export function render(ctx, world, W, H, opts = {}) {
  const { leader, groundY = H - 96, showPopulation = true, scale = 1.9 } = opts;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // Treadmill: the ground scrolls, the creatures stay put. Each is drawn relative to
  // its own centre of mass so the whole population superimposes at one anchor.
  const scrollX = leader ? leaderX(leader) * scale : 0;
  const anchorX = W * 0.42;

  drawGrid(ctx, W, H, scrollX, groundY);
  drawGround(ctx, W, H, scrollX, groundY, scale);

  if (showPopulation) {
    for (const c of world.population) {
      if (c === leader || !c.alive) continue;
      drawAt(ctx, c, anchorX, groundY, scale, 0.09, false);
    }
  }
  if (leader) drawAt(ctx, leader, anchorX, groundY, scale, 1, true);

  drawPanel(ctx, world, W, H, leader);
}

/** Draw one creature at a fixed screen anchor, in its own local frame. */
function drawAt(ctx, c, anchorX, groundY, scale, alpha, highlight) {
  ctx.save();
  ctx.translate(anchorX, groundY);
  ctx.scale(scale, scale);
  ctx.translate(-leaderX(c), 0);
  drawCreature(ctx, c, alpha, highlight);
  ctx.restore();
}

function leaderX(c) {
  let s = 0;
  for (let i = 0; i < c.x.length; i++) s += c.x[i];
  return s / c.x.length;
}

// ── Environment ───────────────────────────────────────────────────────────────
function drawGrid(ctx, W, H, camX, groundY) {
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  const step = 40;
  const off = -(camX % step);
  ctx.beginPath();
  for (let x = off; x < W; x += step) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, groundY);
  }
  for (let y = groundY; y > 0; y -= step) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(W, Math.round(y) + 0.5);
  }
  ctx.stroke();
}

function drawGround(ctx, W, H, camX, groundY, scale = 1) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(0, groundY + 0.5);
  ctx.lineTo(W, groundY + 0.5);
  ctx.stroke();

  // Hatching below grade — reads as "solid" without a heavy fill.
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const s = 9;
  const off = -(camX % s);
  for (let x = off - H; x < W + s; x += s) {
    ctx.moveTo(x, groundY + 1);
    ctx.lineTo(x + 22, groundY + 23);
  }
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, groundY + 24, W, H - groundY);

  // Distance ticks every 200px of world space.
  ctx.fillStyle = MUTED;
  ctx.font = MONO_SM;
  ctx.textAlign = 'center';
  const stepPx = 200 * scale;
  const first = Math.floor(camX / stepPx) * stepPx;
  for (let sxWorld = first; sxWorld < camX + W; sxWorld += stepPx) {
    const sx = sxWorld - camX;
    const wx = Math.round(sxWorld / scale);
    if (sx < 24 || sx > W - 24) continue;
    ctx.strokeStyle = MUTED;
    ctx.beginPath();
    ctx.moveTo(sx + 0.5, groundY + 1);
    ctx.lineTo(sx + 0.5, groundY + 7);
    ctx.stroke();
    ctx.fillText(`${wx}`, sx, groundY + 19);
  }
  ctx.textAlign = 'left';
}

// ── Creature ──────────────────────────────────────────────────────────────────
function drawCreature(ctx, c, alpha, highlight) {
  ctx.globalAlpha = alpha;

  // Bones — hairline structure.
  ctx.strokeStyle = highlight ? INK : MUTED;
  ctx.lineWidth = (highlight ? 1.6 : 1) / 1.9;
  ctx.beginPath();
  for (const b of c.bones) {
    ctx.moveTo(c.x[b.a], c.y[b.a]);
    ctx.lineTo(c.x[b.b], c.y[b.b]);
  }
  ctx.stroke();

  // Muscles — thickness and hue encode actuation, so the gait is legible as a
  // pattern of colour, not just motion.
  for (let k = 0; k < c.muscles.length; k++) {
    const mu = c.muscles[k];
    const a = c.act[k];
    ctx.strokeStyle = highlight ? (a < 0 ? ACCENT : ACCENT2) : MUTED;
    ctx.lineWidth = (highlight ? 1 + Math.abs(a) * 3.2 : 1) / 1.9;
    ctx.globalAlpha = alpha * (highlight ? 0.35 + Math.abs(a) * 0.65 : 1);
    ctx.beginPath();
    ctx.moveTo(c.x[mu.a], c.y[mu.a]);
    ctx.lineTo(c.x[mu.b], c.y[mu.b]);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;

  // Joints.
  ctx.fillStyle = highlight ? INK : MUTED;
  for (let i = 0; i < c.x.length; i++) {
    const foot = i === 5 || i === 7;
    const r = highlight ? (i === 0 ? 4.6 : foot ? 3.4 : 2.6) : 1.6;
    ctx.beginPath();
    ctx.arc(c.x[i], c.y[i], r, 0, Math.PI * 2);
    ctx.fill();
    // Contact marker — a ring when the foot is loaded.
    if (highlight && foot && c.grounded[i]) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.4 / 1.9;
      ctx.beginPath();
      ctx.arc(c.x[i], c.y[i], 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// ── Instrument panel ──────────────────────────────────────────────────────────
function drawPanel(ctx, world, W, H, leader) {
  const pad = 22;

  ctx.fillStyle = INK;
  ctx.font = MONO_LG;
  ctx.fillText(`GEN ${String(world.generation).padStart(3, '0')}`, pad, pad + 22);

  ctx.font = MONO;
  ctx.fillStyle = MUTED;
  const rows = [
    ['population', `${world.population.length}`],
    ['episode', `${world.step}/620`],
    ['best this gen', leader ? `${(leaderX(leader) - leader.startX).toFixed(0)} px` : '\u2014'],
    ['best ever', `${world.bestEver.toFixed(0)} px`],
    ['foot contact', leader ? `${(leader.contactFrac * 100).toFixed(0)} %` : '\u2014'],
  ];
  rows.forEach(([k, v], i) => {
    const y = pad + 46 + i * 15;
    ctx.fillStyle = MUTED;
    ctx.fillText(k, pad, y);
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText(v, pad + 148, y);
    ctx.textAlign = 'left';
  });

  drawFitnessPlot(ctx, world, W - 250 - pad, pad, 250, 92);

  ctx.font = MONO_SM;
  ctx.fillStyle = MUTED;
  ctx.fillText('GAIT LAB \u2014 evolved locomotion, 134 weights, no gradients', pad, H - pad);
}

function drawFitnessPlot(ctx, world, x, y, w, h) {
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);

  ctx.fillStyle = MUTED;
  ctx.font = MONO_SM;
  ctx.fillText('BEST DISTANCE / GENERATION', x, y - 6);

  const hist = world.history;
  if (hist.length < 2) return;
  const max = Math.max(...hist, 1);

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  hist.forEach((v, i) => {
    const px = x + (i / (hist.length - 1)) * w;
    const py = y + h - (v / max) * (h - 8) - 4;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText(`${max.toFixed(0)}`, x + w - 3, y + 11);
  ctx.textAlign = 'left';
}
