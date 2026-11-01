# The trembling (sweep-flicker, started 2026-11-01 evening)

The user: something trembles almost everywhere in the city, "certainly in motion, but also not in motion". It's old, not from one
change, and no place was named. Stills can't show it, so nobody had been judging it.

## Resume here
Branch `claude/kind-gates-528389`, port 5234. Limit 23:30 on 2026-11-01. Temporal AA is on by default (`?notaa`, `?nosweepflicker`).
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
