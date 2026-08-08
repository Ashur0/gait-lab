# Gait Lab

Sixty creatures teach themselves to walk in your browser. No backpropagation, no
training data — a 134-weight neural network per creature, and nothing but truncation
selection and gaussian mutation.

**Live: https://ashur0.github.io/gait-lab/**

The solid figure is the current leader; the pale cloud behind it is the other
fifty-nine, each drawn in its own local frame so the whole population superimposes.
Red muscles are contracting, blue extending, and a red ring marks a loaded foot.
The cloud tightening into one silhouette is the population converging on a gait.

## Two things it learned before it learned to walk

**It learned to fly.** Verlet integration infers velocity from position, so every
constraint correction silently became momentum. Evolution found this within ten
generations — 91% airborne, scoring 10x a real gait. Fixed by conserving
centre-of-mass velocity whenever no foot is loaded: internal forces cannot move you,
only the ground can.

**Then it learned to cheat.** With honest physics but a distance-only reward, the
winner coiled its legs, catapulted, and glided. Fitness is now
`distance x ground-contact x posture`, with hard limits on launch height and spine
roll. Soft incentives were not enough on their own — posture shaping alone left the
body folded into a diagonal shuffle at 47%; a hard spine-tilt limit took it to 80%.

## Layout

| file | what it is |
|---|---|
| `sim.js` | physics + evolution. No DOM — runs identically in Node and the browser. |
| `render.js` | canvas renderer. Takes any 2D context, so the shipped code is the code screenshotted headlessly while building. |
| `tools/page.html` | page shell |
| `tools/build.mjs` | inlines `sim.js` + `render.js` into a single self-contained `index.html` |
| `tools/shoot.mjs` | headless screenshots across generations (`@napi-rs/canvas`) |

```bash
node tools/build.mjs     # rebuild index.html after editing sim.js or render.js
node train-test.mjs      # headless: does it actually learn?
node contact.mjs         # headless: is it walking, or exploiting the physics?
```
