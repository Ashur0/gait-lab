/**
 * Gait Lab — physics + evolution core.
 *
 * No DOM, no canvas: this file runs identically in Node (for headless testing and
 * screenshots) and in the browser. render.js draws whatever this produces.
 *
 * Physics is Verlet integration with distance constraints rather than a rigid-body
 * joint solver. That is a deliberate choice: constraint relaxation cannot inject
 * energy the way an impulse solver can, so the creatures are numerically stable
 * under mutation. An evolved controller WILL find whatever explosion your physics
 * allows, so the physics has to be un-explodable.
 */

const GRAVITY = 0.45;
const DAMPING = 0.995;
const CONSTRAINT_ITERATIONS = 10;  // stiffer torso — 6 lets the body fold in half
const GROUND_Y = 0;

/**
 * Ground height at world x. Deterministic sum of sines — no state, so the renderer
 * and the physics agree without sharing anything.
 *
 * Amplitude ramps in over the first 500px. Starting creatures on hills selects for
 * whoever happens to spawn facing downhill instead of for locomotion; a flat run-up
 * lets a gait establish itself before the terrain starts asking questions of it.
 */
export function groundAt(x) {
  const ramp = Math.min(1, Math.max(0, x - 120) / 500);
  return (
    ramp *
    (Math.sin(x * 0.0121) * 10 +
      Math.sin(x * 0.0292 + 1.7) * 4.5 +
      Math.sin(x * 0.0067 + 0.4) * 6.5)
  );
}
const GROUND_FRICTION = 0.42;

// ── Obstacles ─────────────────────────────────────────────────────────────────
// World-space blocks the viewer drops in. They persist across generations, which is
// the whole point: put a wall down and the population has to *evolve* past it rather
// than the current champion improvising.
export const obstacles = [];
export const BLOCK_W = 30;
export const BLOCK_H = 24;

export function addObstacle(x) {
  obstacles.push({ x: x - BLOCK_W / 2, y: groundAt(x) - BLOCK_H, w: BLOCK_W, h: BLOCK_H });
}
export function clearObstacles() {
  obstacles.length = 0;
}
// Max height the COM may reach above rest before we call it a leap, not a step.
const LAUNCH_CEILING = 90;
// Standing centre-of-mass height, used as the posture reference.
const MAX_TILT = 0.62;  // rad (~35 deg) of spine roll before we call it a fall
const REST_Y = -37.9;  // measured: settled COM of the unactuated body

// ── Creature morphology ───────────────────────────────────────────────────────
// Hand-designed rather than randomised: a recognisable body reads as a creature
// learning to walk, where a random node-soup reads as noise. Nodes are laid out in
// a body-local frame; y is up-negative (screen convention) and the feet sit at y=0.
const MORPHOLOGY = {
  nodes: [
    { x: -20, y: -76, m: 0.5 }, //  0 head
    { x: 4, y: -64, m: 1.0 }, //  1 shoulder
    { x: 30, y: -62, m: 1.0 }, //  2 mid-spine
    { x: 56, y: -64, m: 1.0 }, //  3 hip
    { x: 2, y: -33, m: 0.7 }, //  4 front knee
    { x: 0, y: 0, m: 1.1 }, //  5 front foot
    { x: 58, y: -33, m: 0.7 }, //  6 rear knee
    { x: 60, y: 0, m: 1.1 }, //  7 rear foot
  ],
  // Rigid scaffolding — spine, neck, thighs, and the braces that stop the knees
  // collapsing into the torso. Never actuated.
  bones: [
    [0, 1], [1, 2], [2, 3], // spine + neck
    [0, 2], [1, 3], // spine braces
    [1, 4], [3, 6], // thighs
    [2, 4], [2, 6], // knee braces
  ],
  // Actuated springs. The controller modulates each rest length by ±`range`.
  // Shortening 1–5 pulls the foot toward the shoulder, which bends the knee: a real
  // two-segment leg rather than a telescoping stick.
  muscles: [
    { a: 4, b: 5, range: 0.34 }, //  front shin  — extend/retract
    { a: 6, b: 7, range: 0.34 }, //  rear shin
    { a: 1, b: 5, range: 0.24 }, //  front swing — drives the leg fore/aft
    { a: 3, b: 7, range: 0.24 }, //  rear swing
  ],
  head: 0,
  feet: [5, 7],
};

const N_MUSCLES = MORPHOLOGY.muscles.length;
const N_INPUTS = 10;
const N_HIDDEN = 10;
export const N_PARAMS =
  N_INPUTS * N_HIDDEN + N_HIDDEN + N_HIDDEN * N_MUSCLES + N_MUSCLES;

// ── Tiny MLP policy ───────────────────────────────────────────────────────────
// tanh hidden layer, tanh output. Outputs map directly to muscle contraction in
// [-1, 1]. Small enough (see N_PARAMS) that plain evolution beats gradient
// methods here — no backprop, no dataset, no training rig.
function policy(params, inputs, out) {
  let p = 0;
  const hidden = new Float64Array(N_HIDDEN);
  for (let h = 0; h < N_HIDDEN; h++) {
    let sum = params[p + N_INPUTS * N_HIDDEN + h]; // bias block sits after weights
    for (let i = 0; i < N_INPUTS; i++) sum += inputs[i] * params[p + h * N_INPUTS + i];
    hidden[h] = Math.tanh(sum);
  }
  p += N_INPUTS * N_HIDDEN + N_HIDDEN;
  for (let o = 0; o < N_MUSCLES; o++) {
    let sum = params[p + N_HIDDEN * N_MUSCLES + o];
    for (let h = 0; h < N_HIDDEN; h++) sum += hidden[h] * params[p + o * N_HIDDEN + h];
    out[o] = Math.tanh(sum);
  }
  return out;
}

// ── One creature instance ─────────────────────────────────────────────────────
export function createCreature(params) {
  const n = MORPHOLOGY.nodes.length;
  const c = {
    params,
    x: new Float64Array(n),
    y: new Float64Array(n),
    px: new Float64Array(n),
    py: new Float64Array(n),
    m: new Float64Array(n),
    grounded: new Uint8Array(n),
    bones: [],
    muscles: [],
    act: new Float64Array(N_MUSCLES),
    t: 0,
    frames: 0,
    contactFrames: 0,
    contactFrac: 0,
    postureSum: 0,
    postureFrac: 0,
    startX: 0,
    fitness: 0,
    alive: true,
  };
  for (let i = 0; i < n; i++) {
    const nd = MORPHOLOGY.nodes[i];
    c.x[i] = c.px[i] = nd.x;
    c.y[i] = c.py[i] = nd.y;
    c.m[i] = nd.m;
  }
  const dist = (a, b) => Math.hypot(c.x[a] - c.x[b], c.y[a] - c.y[b]);
  for (const [a, b] of MORPHOLOGY.bones) c.bones.push({ a, b, len: dist(a, b) });
  for (const mu of MORPHOLOGY.muscles)
    c.muscles.push({ a: mu.a, b: mu.b, len: dist(mu.a, mu.b), range: mu.range });
  c.startX = centreX(c);
  return c;
}

/** Mass-weighted centre-of-mass velocity. axis 0 = x, 1 = y. */
function comVel(c, axis) {
  let p = 0, M = 0;
  for (let i = 0; i < c.x.length; i++) {
    const v = axis === 0 ? c.x[i] - c.px[i] : c.y[i] - c.py[i];
    p += c.m[i] * v;
    M += c.m[i];
  }
  return p / M;
}

function centreX(c) {
  let s = 0;
  for (let i = 0; i < c.x.length; i++) s += c.x[i];
  return s / c.x.length;
}
function centreY(c) {
  let s = 0;
  for (let i = 0; i < c.y.length; i++) s += c.y[i];
  return s / c.y.length;
}

const _in = new Float64Array(N_INPUTS);

export function stepCreature(c) {
  if (!c.alive) return;
  c.t++;

  // ── Sense ───────────────────────────────────────────────────────────────────
  // A phase clock is included deliberately: locomotion is periodic, and giving the
  // network a rhythm to latch onto is the difference between "learns to walk in 40
  // generations" and "never leaves the ground".
  const phase = c.t * 0.06;
  const cx = centreX(c);
  const cy = centreY(c);
  _in[0] = Math.sin(phase);
  _in[1] = Math.cos(phase);
  _in[2] = (c.y[1] - c.y[3]) / 30; // body pitch
  const gHere = groundAt(cx);
  _in[3] = (cy - gHere) / 60 + 1; // ride height above LOCAL ground
  _in[4] = (c.x[2] - c.px[2]) * 0.5; // forward velocity
  _in[5] = c.grounded[5] ? 1 : -1; // front foot contact
  _in[6] = c.grounded[7] ? 1 : -1; // rear foot contact
  // Terrain preview. Without these the network can only react after a foot lands;
  // with them it can set the leg up before the slope arrives.
  _in[7] = (groundAt(cx + 46) - gHere) / 18; // slope ahead
  _in[8] = (gHere - groundAt(cx - 32)) / 18; // slope just crossed
  _in[9] = 1; // constant — lets the net learn a resting posture

  policy(c.params, _in, c.act);

  // ── Integrate ───────────────────────────────────────────────────────────────
  for (let i = 0; i < c.x.length; i++) {
    const vx = (c.x[i] - c.px[i]) * DAMPING;
    const vy = (c.y[i] - c.py[i]) * DAMPING;
    c.px[i] = c.x[i];
    c.py[i] = c.y[i];
    c.x[i] += vx;
    c.y[i] += vy + GRAVITY;
  }

  // Centre-of-mass velocity immediately after integration. Constraints are INTERNAL
  // forces and must not change it (Newton's third law); only the ground may.
  const preVx = comVel(c, 0);
  const preVy = comVel(c, 1);

  // ── Satisfy constraints ─────────────────────────────────────────────────────
  let anyGrounded = 0;
  for (let it = 0; it < CONSTRAINT_ITERATIONS; it++) {
    for (const b of c.bones) solve(c, b.a, b.b, b.len, 1.0);
    for (let k = 0; k < c.muscles.length; k++) {
      const mu = c.muscles[k];
      solve(c, mu.a, mu.b, mu.len * (1 + c.act[k] * mu.range), 0.85);
    }
    // Ground is resolved inside the relaxation loop so feet don't sink between
    // constraint passes — resolving it only once per frame produces visible jitter.
    for (let i = 0; i < c.x.length; i++) {
      c.grounded[i] = 0;
      const gy = groundAt(c.x[i]);
      if (c.y[i] > gy) {
        c.y[i] = gy;
        c.grounded[i] = 1;
        anyGrounded = 1;
        const vx = c.x[i] - c.px[i];
        c.x[i] = c.px[i] + vx * (1 - GROUND_FRICTION);
      }

      // Blocks. Push out along whichever axis is shallowest so a foot landing on top
      // is stood up, while a shin hitting the side is stopped rather than teleported.
      for (let o = 0; o < obstacles.length; o++) {
        const b = obstacles[o];
        if (c.x[i] < b.x || c.x[i] > b.x + b.w || c.y[i] < b.y || c.y[i] > b.y + b.h)
          continue;
        const dTop = c.y[i] - b.y;
        const dLeft = c.x[i] - b.x;
        const dRight = b.x + b.w - c.x[i];
        if (dTop <= dLeft && dTop <= dRight) {
          c.y[i] = b.y;
          c.grounded[i] = 1;
          anyGrounded = 1;
          const vx2 = c.x[i] - c.px[i];
          c.x[i] = c.px[i] + vx2 * (1 - GROUND_FRICTION);
        } else if (dLeft < dRight) {
          c.x[i] = b.x;
        } else {
          c.x[i] = b.x + b.w;
        }
      }
    }
  }

  // ── Conserve momentum while airborne ────────────────────────────────────────
  // Without this the creature swims. Verlet infers velocity from position, so every
  // constraint correction silently becomes momentum — and evolution finds that within
  // ~10 generations, producing a flying creature that never touches the ground and
  // scores 10x a real gait. With no foot in contact there is no external force, so we
  // hold COM velocity to its post-gravity value and let only shape change internally.
  if (!anyGrounded) {
    const dvx = comVel(c, 0) - preVx;
    const dvy = comVel(c, 1) - preVy;
    for (let i = 0; i < c.x.length; i++) {
      c.px[i] += dvx;
      c.py[i] += dvy;
    }
  }

  // A creature that has face-planted is done — otherwise evolution discovers that
  // faceplanting and sliding scores as well as walking, and you get a population of
  // very fast corpses instead of a gait.
  const gTorso = groundAt(centreX(c));
  if (c.y[1] - gTorso > -14 && c.y[3] - gTorso > -14) c.alive = false;

  // Ballistic leaps are not a gait. Without this, the winning strategy is to coil the
  // legs, catapult once, and glide — 90% airborne, and it looks nothing like walking.
  if (centreY(c) - groundAt(centreX(c)) < -LAUNCH_CEILING) c.alive = false;

  // Nor is lying down. Soft posture *shaping* was not enough on its own: distance
  // still outbid it and the body settled into a diagonal triangle that shuffled along.
  // A hard tilt limit forbids that whole family of solutions outright, the same way
  // the launch ceiling forbids gliding. Constraints beat incentives here.
  const spineTilt = Math.atan2(c.y[3] - c.y[1], c.x[3] - c.x[1]);
  if (Math.abs(spineTilt) > MAX_TILT) c.alive = false;

  if (anyGrounded) c.contactFrames++;
  c.frames++;

  // Posture bookkeeping. `level` = torso close to horizontal; `tall` = riding at
  // roughly its standing height rather than folded onto the ground.
  const level = 1 - Math.min(1, Math.abs(c.y[1] - c.y[3]) / 34);
  const tall = 1 - Math.min(1, Math.abs(centreY(c) - groundAt(centreX(c)) - REST_Y) / 26);
  c.postureSum += level * 0.5 + tall * 0.5;

  // ── Fitness shaping ─────────────────────────────────────────────────────────
  // Distance alone selects for hopping and gliding. Weighting by the fraction of
  // time a foot is actually loaded is what selects for a *gait*. This is the whole
  // craft of evolutionary robotics: you don't get what you want, you get what you
  // measure.
  const dist = centreX(c) - c.startX;
  const contactFrac = c.frames ? c.contactFrames / c.frames : 0;
  const postureFrac = c.frames ? c.postureSum / c.frames : 0;
  c.contactFrac = contactFrac;
  c.postureFrac = postureFrac;
  // Distance x gait x posture. Drop the posture term and evolution converges on a
  // folded tangle that shuffles forward fast — it scores well and looks like nothing.
  c.fitness = dist * (0.2 + 0.8 * contactFrac) * (0.15 + 0.85 * postureFrac);
}

function solve(c, a, b, target, stiffness) {
  const dx = c.x[b] - c.x[a];
  const dy = c.y[b] - c.y[a];
  const d = Math.hypot(dx, dy) || 1e-6;
  const diff = ((d - target) / d) * stiffness * 0.5;
  const ma = c.m[a], mb = c.m[b];
  const wa = mb / (ma + mb), wb = ma / (ma + mb);
  c.x[a] += dx * diff * 2 * wa;
  c.y[a] += dy * diff * 2 * wa;
  c.x[b] -= dx * diff * 2 * wb;
  c.y[b] -= dy * diff * 2 * wb;
}

// ── Evolution ─────────────────────────────────────────────────────────────────
// Truncation selection + gaussian mutation. Deliberately the simplest thing that
// works: no crossover, no adaptive sigma, nothing to tune or explain.
export const POP_SIZE = 60;
export const EPISODE_STEPS = 620;
const ELITE_FRAC = 0.2;
const SIGMA = 0.22;

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function createWorld(seed = 1) {
  const w = {
    generation: 0,
    step: 0,
    population: [],
    genomes: [],
    history: [],
    medians: [],
    best: 0,
    bestEver: 0,
    bestGenome: null,
  };
  for (let i = 0; i < POP_SIZE; i++) {
    const g = new Float64Array(N_PARAMS);
    for (let j = 0; j < N_PARAMS; j++) g[j] = gauss() * 0.6;
    w.genomes.push(g);
  }
  respawn(w);
  return w;
}

function respawn(w) {
  w.population = w.genomes.map((g) => createCreature(g));
  w.step = 0;
}

/** Advance the whole population one physics tick. Returns true if the generation ended. */
export function stepWorld(w) {
  for (const c of w.population) stepCreature(c);
  w.step++;
  if (w.step < EPISODE_STEPS) return false;

  const scored = w.population
    .map((c, i) => ({ i, f: c.fitness }))
    .sort((a, b) => b.f - a.f);
  w.best = scored[0].f;
  w.history.push(w.best);
  // Median as well as best: the gap between them IS the selection pressure, and a
  // best-only curve hides whether the population is following its champion or the
  // champion is a lucky outlier the rest never reach.
  w.median = scored[Math.floor(scored.length / 2)].f;
  w.medians.push(w.median);
  if (w.best > w.bestEver) {
    w.bestEver = w.best;
    w.bestGenome = Float64Array.from(w.genomes[scored[0].i]);
  }

  const nElite = Math.max(2, Math.round(POP_SIZE * ELITE_FRAC));
  const elites = scored.slice(0, nElite).map((s) => w.genomes[s.i]);
  const next = elites.map((g) => Float64Array.from(g)); // elitism: keep them intact
  while (next.length < POP_SIZE) {
    const parent = elites[Math.floor(Math.random() * elites.length)];
    const child = Float64Array.from(parent);
    for (let j = 0; j < N_PARAMS; j++) if (Math.random() < 0.28) child[j] += gauss() * SIGMA;
    next.push(child);
  }
  w.genomes = next;
  w.generation++;
  respawn(w);
  return true;
}

export function leader(w) {
  let best = w.population[0];
  for (const c of w.population) if (c.fitness > best.fitness) best = c;
  return best;
}

export const _internals = { MORPHOLOGY, GROUND_Y, centreX, centreY };
