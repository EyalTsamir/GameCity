# White where it should not be (sweep-fix-a, 2026-11-02)

Two families from `sweep-findings.md`: `wall-material-differs-by-distance` (`fbf2de0`) and `sky-specks-dots` (`0e76a70`). Switches in `src/core/sweepwhite.ts`: `?nosweepwhite` turns all of it off, and each fix has its own below. None needs a quality tier: the prepass exists only on high, and the other fixes cost nothing on any tier.

## Square-on walls (`?noprepasssame`)

**What it looked like.** A wall or pane parallel to the image plane loses its colour and interior: pale blue-white, cyan mortar lines, milky glass. At 8° off the same wall is right. The condition is the wall's normal along the camera axis, not the line of sight, so a wall off to the side of the frame does it too, and a level walk along a street makes every wall across its end flash when the heading settles (the city-sweep walk's one-frame flash at x −35, z 108.25 is this fault).

**Cause.** The depth prepass `buildings-prepass` (`src/world/buildings.ts`, high quality only) computed `projectionMatrix * modelViewMatrix * v`, while three's `project_vertex` computes `mv = modelViewMatrix * v`, then `projectionMatrix * mv`. GLSL doesn't promise those round alike. The prepass used `polygonOffset` to stay behind the facade, but the factor is multiplied by the depth slope, and the slope is 0 on a wall facing the camera, which left 1 unit: less than the rounding apart. The facade then failed its LEQUAL test, and the pixel kept `scene.background`, which `sky.ts` copies from the horizon colour every frame. The close-material multiply layer (`blendSrc: DstColor`) stamped mortar on that.

**Fix.** The prepass uses three's order of operations, so both passes round alike, with 4 units as a margin. Either one alone would have been enough in the test below: 0 of 336 with the expression at 1 unit and also at 4. Bigger units alone did not fix it (4 partly, 16 fully, with the old expression), so the expression is the fix and the units are insurance.

**Checked.**
- Frames at 0°, 1°, 8°: `shots/sweep-white/before.png`, `after.png` (6 buildings × 1, 3, 10 m, noon), `night.png` (fixed, 21.5 h). The white at 0° is gone; 1° and 8° didn't change.
- City metric: each pose against the same frame with the prepass hidden, TAA off, with known-bad walls as a positive control. Old 70 of 336 poses bad (up to 100 % of the frame; townhouse, school, apartment, boathouse, house). New 0 of 336. Then all 388 footprint walls × 2, 6, 20 m: 1 flagged of 1,170, a pedestrian's head in front of the lens with the shop behind it right.
- The walk's flash: stepping the line at x −37 … −33, z 108.25, old 9 of 48 poses show the white facade (`shots/sweep-white/flash-old.jpg`), new 0 (`flash-new.jpg`). `sweep-motion.mjs --pitch 0` on the fix: no event within 8 m of the spot, where the old walk had three.
- Other depth-only materials (`pedestrians/shader.ts` proxy, `sparks.ts` prepass, `trainMaterial.ts` paneDepth) were read and are not this fault.

## Dots at noon (`?nonoonmotes`, `?nodayaviation`, `?noavmast`)

**White dots: dust motes.** `life-sparkles` in `life/drift.ts` has a forward-scatter term with a 1.5 px minimum, and its low-sun factor kept 25 % at high sun. Looking up toward a noon sun they hung in the blue and across facades. Now none above sun elevation 0.5; golden hour unchanged.

**Red dots: aviation lights.** `LIGHT_MODE.BLINK` drew a saturated red ball of 0.32 m by day (`dayLook 0.65` and a 25 % flash at intensity 7), placed 30 cm in from the roof corners and so floating over chamfers and notches. By day now a dull lens with no flash; night unchanged (`?nodayaviation`). On a thin mast, set back from the edge past the crown's chamfer or notch, lens 0.2 m (`?noavmast`). Sites done: `towers.ts` crown corners, slant tops, the upper shaft. Left as they were: `towers.ts:873` and `:964–965`, already on a mast or spire; `special.ts:756` on its antenna, which inherits the day look; `tvtower.ts`, the landmark's own light, already dim by day.

**Checked.** `shots/sweep-white/dots-old.jpg` / `dots-new.jpg` (boathouse, looking up at noon): every white dot gone, nothing else moved. `tower-day.jpg`, `tower-night.jpg`: small dull lenses by day, blinking red at night.

## Cost

Rebaked, on AC behind `power-guard`, `abprof.mjs`, two runs each, 4 cycles of 2 s, ms new minus old, 1920 × 1025, noon. A delta of ±21 is a stutter inside a window, not a measure of the fix.

| view | prepass run 1 | prepass run 2 | motes hidden (upper bound) |
|---|---|---|---|
| overview | noise (±23) | 0 ±0.51 | −0.31 ±0.17, −0.27 ±0.21 |
| downtown | 0 ±0.17 | +0.06 ±0.25 | −0.24 ±0.28, −0.02 ±0.38 |
| street | +0.72 ±0.83 | noise (±21) | +0.83 ±1.42, +0.38 ±0.89 |
| market | +0.37 ±0.35 | −0.21 ±0.16 | −0.03 ±0.35, −0.08 ±0.29 |
| square (−92.5, 1.6, −112.5, 5, 180, 0) | +8.01 ±0.67 | +7.36 ±0.41 | n/a |

- Budget (+0.2 overview and downtown, +0.7 street and market): held, as far as the noise shows. Street rests on one run, +0.72 ±0.83: not separable from 0.
- Square is not a cost of the fix: the old code skipped the facade there because it failed depth. It's what a wall costs when really shaded, the same as a few degrees off.
- Motes: no new cost. The draw stays and only its gain changed. Hiding them saves at most 0.3 ms at overview.
- Masts: +1,496 triangles at overview (3,652,340 against 3,650,844 with `?noavmast`), about 4 µs at 2.5 ns each. The `perf.mjs` reload difference is 0.16 ms in favour of the masts at overview, 0.06 at downtown: noise.

## Conservative choices

- The units went to 4, not left at 1, though the metric says 1 was enough with the same expression: the margin is free on a wall with the expression matched, and only the facade's own pass reads this depth.
- No separate quality tier. The prepass is high only, and motes and lights are shader values.
- Aviation lights stay, as the rule says nothing shown is cut: only their day look and footing changed.

## Left

- **The sweep's square-on pictures should be rejudged**, since the fault distorted them. city-sweep moved 1,138 kind and 381 cell pictures to `shots/sweep-axis/` and shot those from 8° off, so rejudge any finding from a 0° picture. Families it likely inflated: `glass-flat-no-depth`, `lighting-inconsistent-noon`.
- Seen, not this family (`lighting-inconsistent-noon`, on hold): the sky looks dim, almost dusky, in the boathouse `up` picture at noon.
- Mid-walk near objects: walking through a seagull or a person fills the frame. Those are the walk's strongest remaining flags, and they're the route's fault as much as the city's.
