# The trembling (sweep-flicker, started 2026-11-01 evening)

The user: something trembles almost everywhere in the city, "certainly in motion, but also not in motion". It's old, not from one
change, and no place was named. Stills can't show it, so nobody had been judging it.

## Resume here
Branch `claude/kind-gates-528389`, port 5234. Limit 00:45 on 2026-11-02. Temporal AA is on by default (`?notaa`, `?nosweepflicker`).
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
`ui-test.mjs --q noidle` 15 passed, 3 failed (tooltip, follow, kinds), then a harness error: **not from this work**. It stubs `/@vite/client`, and in dev the `__BUILD_ID__` define from 8d7fe8c arrives through that client, so the `ui` module doesn't load in that test. Published builds aren't affected.

## Cost, ms per frame, 1920×1025, high, dev server, behind the power guard, 2 + 2 interleaved, hour 12, SMAA → TAA
| view | at rest | camera moving (`?taamove`, before the depth check) |
|---|---|---|
| overview | 33.8 → 33.8 | 33.8 → 33.9 |
| downtown | 32.2 → 32.1 | 32.2 → 32.2 |
| street | 38.0 → 38.1 | 38.0 → 39.5 |
| market | 37.4 → 37.4 | 37.4 → 37.5 |
Street moving is +1.5, over the +0.7 budget, repeatable (39.45, 39.6), unexplained, and only at that view. The depth check adds one pass and five fetches while moving: **not measured**, the limit came first. Night, an earlier setting (jitter 0.7), 2 + 2, TAA vs SMAA at rest: overview −0.35, downtown −0.5, market −0.33, street +1.3 with one outlier run (393 draws, 4.8 M triangles): not a clean number.

## What is left
- **Walking at full speed near the ground has no AA from history, and no SMAA either**, by choice: `walk` is still better than before on the numbers and crisp in the frames. If raw edges read as harsh in real walking, lower `nearPx`'s effect first.
- A person's own pixels keep some history while overlapping their last position. Frames look solid; not watched in real motion.
- Nobody has watched this with human eyes at real speed. Numbers and single frames only.
- `clock` condition (hour running) was never run with TAA.
- Lawn at 3 m with wind: area8 33.6 → 23: grass blades move by design at zero wind too (`osc` in `groundcover/field.ts`). Not touched.
- Marquee lights and neon chase by design (`uRealTime` in `buildings/materials.ts`), the only thing that moves when all is stopped. Not touched.
- `closeset.mjs` takes 5 frames per shot, too few to settle: its stills show a picture not fully settled. Use more throw-away frames when judging sharpness.
