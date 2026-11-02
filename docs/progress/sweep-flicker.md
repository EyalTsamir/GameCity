# The trembling (sweep-flicker, started 2026-11-01 evening)

The user: something trembles almost everywhere in the city, "certainly in motion, but also not in motion". It's old, not from one
change, and no place was named. Stills can't show it, so nobody had been judging it.

## Resume here
Branch `claude/kind-gates-528389`, port 5234. Temporal AA is on by default (`?notaa`, `?nosweepflicker`).
Tool: `scripts/flicker.mjs` (numbers + heat maps), `scripts/flicker-crops.mjs` (sharpness side by side). From a worktree run them with
`TH_HARNESS=C:/Projects/GameCity/scripts/browser.mjs`, so the browser lock is shared.

## How it is measured
`scripts/flicker.mjs` reads truly consecutive frames back in the task that drew them, with the clock fed a steady 1/30 s. Per pixel:
`d2 = |L(t+1) − 2L(t) + L(t−1)|`, which is 0 for steady drift and large for a reversal or a jump, so a tremble is told apart from smooth
motion. `area8` = % of the picture where d2 reached 8/255 at least once in the run. `sharp` = mean fine contrast of the last frame.
Conditions: `still` (all stopped), `wind` (sim running, hour held, traffic and people hidden), `clock` (hour running too), `nudge`
(camera drifts 0.15 px a frame), `pan` (camera turns 0.1 px a frame).

## Findings, hour 12, mean of 7 views (overview, downtown, street, market, wall, tree, lawn at 3 m)
| condition | d2 | area8 % | area24 % |
|---|---|---|---|
| still | 0.9 | 0.01 | 0 |
| wind | 68–84 | 8–9.6 | 3.3–4.2 |
| nudge | 283 | 30.5 | 15.9 |
| pan | 158 | 21.1 | 8.1 |

So with everything stopped the picture is already still: per-frame noise, dither and adaptive stepping are **not** the cause. The trembling is
(1) aliasing on every edge and fine detail as soon as anything moves by a fraction of a pixel, and (2) wind on leaves and grass doing the same with
the camera still. Heat maps: whole window grids and forests light up on a 0.15 px drift.

Suspects toggled one at a time (wind / nudge d2; base 84 / 284):
| switch | wind | nudge | reading |
|---|---|---|---|
| `nograss` | 42 | 238 | large where there is grass (lawn 380 → 79) |
| `noao` | 52 | 216 | half-resolution AO re-rolls on anything sub-pixel |
| `noleafcards` | 60 | 248 | |
| `wind=0` | 50 | 281 | grass keeps moving at zero wind |
| `nonear` | 72 | 231 | near bubble's fine detail shimmers too |
| `nocloth` | 79 | 280 | only the market (92 → 46) |
| `aa=none` | 89 | 306 | SMAA is only a small help in motion: it has no memory |
| `aa=fxaa` | 84 | 263 | |
| `nocontact`, bloom off, `noshadows` | ±2 | ±2 | **not causes**: shadow-map swimming is ruled out |

No single switch removes it, because the cause is one sample per pixel with no memory. That is what the first fix addresses.

## Fix 1: temporal AA with a still rest (`src/render/postfx/taa.ts`, `?notaa`, medium and high)
Replaces SMAA at the end of the chain, after grading, so AO, contact shadows and bloom are steadied too. No motion vectors: camera reprojection by depth
and clipping history to the neighbourhood's spread.

First version (jitter always on), hour 12: nudge area8 30.5 → 10.1, area24 15.9 → 0.7; pan area8 21.1 → 7.2. But **still went 0.01 → 4.5**: a jitter that never
stops adds a shimmer exactly where the user complained. So at rest: settle for 24 frames with falling weights, then stop the jitter; a pixel whose sample didn't change keeps
its value exactly, a small change (sun, cloud shadow) is added as is, a large one (leaf, person) is followed with the clip.
A camera that eases for ever towards its place (overview, lawn) needs a tolerance in "has it moved".

Then fast motion, judged from frames (`walk` 1.4 m/s, `sweep` 4 px a frame), showed what the slow conditions could not: close signs doubled ("KING STREET" unreadable), walkers turned translucent, sharpness −25 to −30 %. Three changes:
- History fades out with a pixel's speed, 1 → 5 px a frame. Aliasing can't be seen that fast and every resampling softens.
- Depth check (`TAA.PrevZ`): a point that isn't where last frame's depth says, against a 5-tap neighbourhood so that edges aren't caught, takes no history. That is what keeps people solid; there are no motion vectors.
- A camera travelling fast near the ground (`nearPx`, point 4 m off moving more than 2–8 px a frame) takes no history and no jitter. Sharpening fades with camera speed too.

Tuning: jitter strength matters more than sharpening. Full ±0.5 px was both shakier and softer. Chosen: jitter 0.6 (`?taaj`), sharpen 0.6 (`?taas`), weight 0.07 (`?taaa`). `?taamove` forces the moving path, for measuring.

## Numbers before (SMAA) → after, hour 12, mean of downtown, street, market (`shots/flick/ghost3`, before the last sharpening change)
| condition | d2 | area8 % | area24 % | sharp |
|---|---|---|---|---|
| still | 3.5 → 5.2 | 0.03 → 0.01 | 0 → 0 | 4.06 → 5.16 |
| wind | 60.7 → 54.5 | 5.7 → 3.9 | 2.7 → 2.4 | 3.93 → 5.03 |
| nudge | 288 → 90 | 30.1 → 10.2 | 15.5 → 1.4 | 4.05 → 3.67 |
| pan | 142 → 66 | 17.0 → 5.8 | 6.6 → 0.9 | 4.05 → 4.28 |
| walk | 1539 → 1458 | 80.4 → 71.1 | 67.7 → 54.2 | 3.97 → 4.35 |
| sweep | 1555 → 1905 | 82.2 → 82.9 | 68.4 → 71.8 | 4.05 → 6.07 |
Sweep was slightly worse because of sharpening on frames without history, which is what the last change addresses; the final check below remeasures it: sweep is now level on area. `sharp` above SMAA at rest is not harshness: the frames show the hatched moiré on the towers gone and lettering clearer. The metric can't tell moiré from detail, so judge the frames too.

## Final check, with the last sharpening change (`shots/flick/final`), mean of downtown, street, market, TAA against SMAA
| condition | hour | d2 | area8 % | area24 % | sharp |
|---|---|---|---|---|---|
| still | 12 | 3.7 → 5.3 | 0.02 → 0.01 | 0 → 0 | 4.02 → 5.10 |
| still | 21.5 | 3.8 → 5.4 | 0.08 → 0.10 | 0.02 → 0.03 | 2.84 → 3.37 |
| nudge | 12 | 289 → 94 | 28.0 → 9.6 | 14.3 → 1.3 | 4.02 → 3.63 |
| nudge | 21.5 | 169 → 69 | 18.6 → 5.8 | 7.8 → 1.0 | 2.84 → 2.48 |
| sweep | 12 | 1457 → 1671 | 77.7 → 77.7 | 62.9 → 64.8 | 4.01 → 5.25 |
| sweep | 21.5 | 1043 → 1128 | 70.2 → 70.1 | 51.8 → 52.2 | 2.84 → 3.35 |
Nudge is the measured win. Fast sweep is level on area and a little higher on d2: at that speed there is no history by design, so it is sharper and no steadier than SMAA.
Other checks: overview at 4× speed, invariants `{}`, validate `[]`, no failed modules, no console errors; diorama, medium and low clean; hitch 0 new shader programs mid-run.
`ui-test.mjs --q noidle` 15 passed, 3 failed (tooltip, follow, kinds), then a harness error: **not from this work**. It stubs `/@vite/client`, and in dev the `__BUILD_ID__` define from 8d7fe8c arrives through that client, so the `ui` module doesn't load in that test. Published builds aren't affected. Rerun on the real Vite client (`--hmr 1 --steps follow,kinds`, with both fixes): 4 passed, 0 failed. The harness itself still needs fixing: without `--hmr` every `ui-test.mjs` run on the full city loses the `ui` module.

## Cost, ms per frame, 1920×1025, high, dev server, behind the power guard, 2 + 2 interleaved, hour 12, SMAA → TAA
| view | at rest | camera moving (`?taamove`, before the depth check) |
|---|---|---|
| overview | 33.8 → 33.8 | 33.8 → 33.9 |
| downtown | 32.2 → 32.1 | 32.2 → 32.2 |
| street | 38.0 → 38.1 | 38.0 → 39.5 |
| market | 37.4 → 37.4 | 37.4 → 37.5 |
Street moving is +1.5, over the +0.7 budget, repeatable (39.45, 39.6), unexplained, and only at that view. The depth check adds one pass and five fetches while moving: **not measured**, the limit came first. Night, an earlier setting (jitter 0.7), 2 + 2, TAA vs SMAA at rest: overview −0.35, downtown −0.5, market −0.33, street +1.3 with one outlier run (393 draws, 4.8 M triangles): not a clean number.

## Fix 3: what moves never keeps history (`436dbb2`, `postfx/taaMovers.ts`, `scripts/taa-city.mjs`)
Live on the site: with the city running, a bus had two fronts and torn window edges, people tore apart, ghosts stayed where people had been. `flicker.mjs` hid traffic and people in its wind condition and stopped them in the others, so no number could see it: the test has to run with them drawn.
Causes: the frozen path kept a running mean, and a small change was added to a value that was already wrong, for ever; the first frame without jitter kept last frame's history whole, leaving a one-frame-wide ghost of whoever was crossing; and a bus sliding along its own side has the same depth each frame, so no depth check catches it.
- Frozen has no feedback: this frame's sample plus what settling added to that pixel, only if the same surface is there (depth within 1 %, value within 0.03–0.1). Otherwise exactly this frame's sample. Nothing can linger. No more history is written at rest, so it is cheaper.
- One box per vehicle, person, train car and boat, drawn into an R8 mask with no material changed and nothing drawn twice. A pixel inside takes no history; the frame after one left it takes none either, and only a pixel clean for three frames goes into the settled picture.

Frames read with the city running, at least 8 frames apart (`shots/flick/city2`): bus at 12 and 21.5, still, just stopped and drifting; police car still at 21.5, just stopped at 12; crowd on the beach still at 12; walker drifting at 21.5. All solid, lettering clean, no ghosts. Before, the same run (`city1`) had doubled lettering and a torn figure on the sand. `?notaa` from the same script did **not** run (a Vite reload crashed it, since fixed in the script); compared only against the coordinator's `sweep-notaa` frame by eye.

Against SMAA, hour 12, downtown, street, market (`shots/flick/after3`):
| condition | d2 | area8 % | area24 % | sharp |
|---|---|---|---|---|
| still | 1.3 → 2.0 | 0.02 → 0.02 | 0 → 0 | 4.07 → 4.92 |
| wind | 47 → 52 | 5.4 → 5.2 | 2.8 → 2.8 | 3.94 → 4.88 |
| nudge | 290 → 185 | 33.9 → 17.4 | 18.9 → 5.6 | 4.07 → 3.82 |
**The win shrank.** Nudge was 94 / 9.6 / 1.3 before this. The market's heat map shows why: its stalls are lit, because every standing vendor and shopper is masked and a 1.5 m range catches the stall around them. Wind with a still camera is now level with SMAA instead of a little better: a leaf is this frame's sample. Sharper at rest.
Next: mask only people and vehicles actually moving (`m.x` against `m.px`, `V.v`), which should bring most of nudge back. Tried instead, no help: depth-rejected pixels keeping their place in the count (nudge 184 / 17.3), reverted, frames unread.

Cost, ms per frame, 2 + 2 interleaved, behind the power guard, hour 12, SMAA → TAA at rest / camera moving (`?taamove`, includes the depth check and the mask):
| view | SMAA | at rest | moving |
|---|---|---|---|
| overview | 33.8 | 33.9 (a 34.9 run at 259 draws left out) | 34.2 |
| downtown | 32.8 | 32.1 | 32.7 |
| street | 41.5 | 41.8 | 43.3 |
| market | 38.7 | 38.2 | 38.6 |
Rest is within budget at all four. Moving: overview +0.4, over the +0.2 budget by a little and within noise; street **+1.8, over the +0.7 budget**. It was +1.5 before the depth check and mask, so those two cost about 0.3 there; the +1.5 is at this view only and still unexplained.

## Fix 2: wind that can't be seen as motion fades out (`?nowindfade`, all tiers)
A back-and-forth under about a pixel can't be read as motion, only as shimmer. Plants (`vegetation/foliage.ts`, `thMotionKeep`): the oscillating part of the main sway, branch bob and leaf flutter fade once their amplitude falls from 1.2 to 0.35 px at that distance, so flutter is whole within about 23 m and gone by 80 m, bob 47 and 160 m. The mean lean stays, and it uses `uNearEye` / `uNearLens`, so shadows match and zooming in brings it back. Grass (`groundcover/field.ts`): the same fade on `osc` using the pixel size it already knows; neighbours now sway as a wave (phase `rb.x * 1.2`, was `* 6.28`); calm air is calmer (floor 0.12, was 0.3).

Wind condition, hour 12, TAA on, off → on (`shots/flick/wind1`):
| view | d2 | area3 % | area8 % | area24 % | sharp |
|---|---|---|---|---|---|
| downtown | 36.9 → 29.3 | 11.9 → 8.0 | 4.0 → 2.9 | 1.9 → 1.6 | 7.23 → 7.20 |
| market | 37.5 → 29.1 | 11.9 → 7.8 | 4.1 → 2.9 | 2.1 → 1.7 | 7.25 → 7.23 |
| overview | 25.4 → 23.3 | 5.5 → 4.3 | 1.4 → 1.2 | 0.7 → 0.6 | 3.80 → 3.76 |
| lawn at 3 m | 252 → 206 | 60.6 → 57.4 | 37.8 → 34.0 | 17.2 → 14.2 | 5.44 → 5.40 |
| tree at 3 m | 29.9 → 30.5 | 13.0 → 13.2 | 5.2 → 5.2 | 1.4 → 1.4 | 2.45 → 2.46 |
The tree at 3 m is unchanged, as intended: real wind up close stays. A clear help, not a cure: about a quarter off in town, and what remains hasn't been traced. Numbers and heat maps only, one run, no frames judged in motion, no cost measured.

## What is left
- Frozen picture and light: a pixel whose value drifts more than 0.1 from when the camera stopped (late sun, a long rest) falls back to its plain sample. Stable, no ghost, but the edge loses its settled AA until the camera moves. Not measured how soon that shows.
- Masked pixels have no AA at all, moving or not: no SMAA on that path. Bus edges read a little harder than with SMAA.
- Other things that move aren't masked: carousel, cranes, turbines, kites, cloth, birds. They rely on depth and clip; the frozen path can't accumulate on them. Not read in frames. Trains and boats are masked but weren't read in frames either.
- **Wind fade cost not measured** (a little vertex work per plant vertex, in a vertex-bound scene). Variant `nowindfade` in `perf.mjs`, after `npm run bake`, behind the power guard.
- Heat maps of the wind condition show bright zig-zag patches that land in different places from run to run: something moving, not wind. Not identified.
- Wind tremble that remains: not attributed. Half-res AO re-rolling on leaves (`noao` was the largest suspect before these fixes) isn't touched: frozen TAA lets small changes through unfiltered. Far trees (`landscape/trees.ts`), props sway (`props/material.ts`), wall green (`buildings/green.ts`) and rows (`landscape/rows.ts`) don't have the fade yet.
- **Walking at full speed near the ground has no AA from history, and no SMAA either**, by choice: `walk` is still better than before on the numbers and crisp in the frames. If raw edges read as harsh in real walking, lower `nearPx`'s effect first.
- A person's own pixels keep some history while overlapping their last position. Frames look solid; not watched in real motion.
- Nobody has watched this with human eyes at real speed. Numbers and single frames only.
- `clock` condition (hour running) was never run with TAA.
- Lawn at 3 m with wind: area8 33.6 → 23: grass blades move by design at zero wind too (`osc` in `groundcover/field.ts`). Not touched.
- Marquee lights and neon chase by design (`uRealTime` in `buildings/materials.ts`), the only thing that moves when all is stopped. Not touched.
- `closeset.mjs` takes 5 frames per shot, too few to settle: its stills show a picture not fully settled. Use more throw-away frames when judging sharpness.
