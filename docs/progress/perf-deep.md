# perf-deep — research all options, reach a real frame-time surplus

Branch `claude/perf-deep-cf97ce`, cut from `claude/pensive-gates-bim12i` @ eba5730. Not pushed or merged here: a coordinator merges.
Dev server: `npx vite --port 5192 --strictPort --host 127.0.0.1`. Frozen baseline eba5730: scratchpad worktree `base` on :5193.
Harness from the main checkout (shared lock), every GPU run behind `scripts/power-guard.mjs`:
`node scripts/power-guard.mjs --out <dir> --cwd C:/Projects/GameCity -- name node scripts/perf.mjs --url http://127.0.0.1:5192/ …`

## Resume here
**Round finished, 2026-10-30, not merged: a coordinator merges.** Everything below is measured on the frozen head against a frozen eba5730, on AC power, behind the guard.
To continue: start from "What remains". Tools: `scripts/abprof.mjs` (runtime A/B), `scripts/splitprof.mjs` (fragment vs vertex, overdraw, per-draw vertices), `scripts/power-guard.mjs`. Scratch copies of base and head were removed: recreate with `git worktree add`.

## Final ledger: ms per frame, before (eba5730) → after (head), 4 runs interleaved (2 + 2), each view stable to ±0.2 unless noted
| view@h | before | after | gain | % | scene | post | shadow | reflection |
|---|---|---|---|---|---|---|---|---|
| overview@12 | 47.0 | 35.5 | **11.5** | −24.5 | 35.8 → 26.9 | 5.4 → 5.4 | 0.9 → 0.9 | 2.9 → 1.4 |
| downtown@12 | 52.9 | 35.1 | **17.8** | −33.7 | 39.4 → 26.4 | 5.5 → 5.3 | 1.3 → 1.2 | 2.1 → 1.0 |
| street@12 | 45.0 | 33.5 | **11.5** | −25.5 | 31.9 → 22.6 | 6.5 → 6.3 | 2.5 → 2.4 | 1.9 → 0.9 |
| market@12 | 45.8 | 32.1 | **13.7** | −29.9 | 35.1 → 23.4 | 5.2 → 5.1 | 2.3 → 2.1 | 1.2 → 0.6 |
| overview@18.2 | 46.2 | 35.0 | **11.2** | −24.2 | 35.9 → 26.7 | 5.2 → 5.1 | 0.8 → 0.9 | 2.9 → 1.4 |
| downtown@18.2 | 52.6 | 33.9 | **18.7** | −35.6 | 39.1 → 25.9 | 5.3 → 5.2 | 1.2 → 1.1 | 2.1 → 1.0 |
| street@18.2 | 41.7 ±0.7 | 31.2 | **10.5** | −25.1 | 28.9 → 21.2 | 6.1 → 5.9 | 2.5 → 2.4 | 2.0 → 0.9 |
| market@18.2 | 36.5 ±0.5 | 30.5 | **6.0** | −16.3 | 26.4 → 22.2 | 4.9 → 4.7 | 2.2 → 2.1 | 1.2 → 0.6 |
| overview@21.5 | 49.4 | 38.6 | **10.8** | −21.9 | 38.7 → 29.8 | 4.9 → 4.8 | 0.9 → 0.8 | 3.2 → 1.5 |
| downtown@21.5 | 56.6 | 38.1 ±0.4 | **18.5** | −32.8 | 44.4 → 29.9 | 5.0 → 4.9 | 1.3 → 1.2 | 2.3 → 1.1 |
| street@21.5 | 42.8 ±2 | 32.7 ±0.5 | **10.1** | −23.7 | 30.1 → 22.4 | 6.1 → 5.9 | 2.5 → 2.4 | 2.1 → 1.0 |
| market@21.5 | 42.6 ±0.6 | 35.8 ±0.4 | **6.8** | −15.9 | 32.7 → 27.0 | 5.0 → 4.9 | 2.5 → 2.4 | 1.4 → 0.7 |

**Against the target (−30 %):** met at downtown (−33 to −36 %, also past the stretch at 18.2) and at the market at noon (−29.9 %). **Not met:** street −24 to −26 %, overview −22 to −25 %, market at 18.2 and 21.5 −16 %. The market's baseline is cheaper at those hours, probably because fewer people are out (not checked), so its people win is smaller. What is left there is real shading, not waste found so far.
Scene pass, split again after the round: fragment 20.9 / 19.1 / 14.1 / 15.7 ms, vertex + binning 6.6 / 6.8 / 6.9 / 7.2 (overview / downtown / street / market; before: 26.7 / 29.7 / 18.7 / 19.8 and 10.4 / 10.5 / 11.4 / 16.5).

**Stutter** (`hitch.mjs`, vsync on, adaptive off, 10 s windows; frames ≥ 50 ms, before → after): overview@12 55 → 13, street@12 43 → 2, market@12 47 → 0, overview@21.5 72 → 19, street@21.5 26 → 3, market@21.5 36 → 7. Worst frame in those windows 66–67 → 50 ms. 0 new shader programs mid-run in every window. p50 is now the 33 ms cadence.
**Boot** (`bootprobe.mjs`, fresh profile, one run each): first frame 19.4 → 17.1 s, 144 → 146 programs, warm-up 5.1 → 3.1 s.
**Allocation:** 0.75 → 0.69 MB per frame at overview@12 (15.5 MB/s at 21 fps → 19.1 MB/s at 28 fps), same order in the other views. Nothing was added per frame; the palette uses preallocated buffers.
**Adaptive** (`?noadapt30`, `soak.mjs` 3 min at ×4 from the overview): stays on `full` at 25–29 fps. It does not walk to lower resolution any more. Its first step (`refl-low`) fails verification (saves < 1 ms) and stands down, so at the overview it holds full detail below a steady 30, with frames mixing 33 and 50 ms. Not tried in a real window.

## The margin and what it buys
Against the 33.3 ms cadence (30 fps, what this GPU can hold with this picture): market@12 +1.2, street@18.2 +2.1, market@18.2 +2.8; street@12 −0.2; downtown@12 −1.8; overview@12 −2.2; night overview −5.3, night downtown −4.8. **So the round mostly closed a gap, it did not leave a large surplus at 30 fps**: 10–18 ms were recovered, but the city started 12–20 ms over budget. 60 fps is out of reach at this resolution.
Prices measured on this GPU at 1920×1025, for spending or saving:
- Static triangles: 2.5 ns, **400 k per ms**. Geometry is the cheap currency: do not fear it.
- Leaf cards: 7.3 ns, 137 k per ms.
- Figures: about 20 ns (6–27 by level), **50 k per ms**, down from 50 ns.
- Pixels: 1 ms = 0.5 ns per pixel over the whole screen. Facades cost about 10–13 ns per pixel, land about 7, water about 7. So 1 ms is 5 % of the screen at facade price.
- Render scale: 0.9 = −4 ms, 0.85 = −6, 0.72 = −10 (0.2 ms per 1 % of pixels, every view). Scale 0.9 alone would bring all noon views to 32 ms or below; it softens the image, was not judged, and was not applied.
- A depth-only pre-pass of a heavy overlapping surface pays when its overdraw is real: facades yes, nothing else.

## Options, ranked by measured gain (ms per frame, overview / downtown / street / market at noon)
Clean run after all other changes unless noted: removing the toggle is what was measured, so the first two overlap with each other a little. The "expected" column is a rough figure from before measuring, several of them written down afterwards from memory or from an agent's estimate: read it as an order of magnitude.
| # | option | toggle | expected | measured | verdict |
|---|---|---|---|---|---|
| 1 | **Flat varyings from the first vertex**: under ANGLE/D3D11, GLES's last-vertex convention puts a geometry shader on every draw of a program with a `flat` varying (people, landmarks). `WEBGL_provoking_vertex`; figure triangles rotated so the same vertex provokes | `?nopvfirst` | found by accident, unknown | −1.2 / −1.7 / −4.5 / −8.8 | **kept**, exact |
| 2 | **Facade depth pre-pass** with a trivial program, high only | `?noshellprepass` | −3 | −2.1 / −7.05 / −4.4 / −1.9 (alternating; harbor −3.3, oldtown −6.7, park −2.2, platform +0.8 ±1.4) | **kept** |
| 3 | **Scene target R11F_G11F_B10F** (half the bandwidth), one step of noise on the sky | `?nor11` | −1 | −3.4 / −5.2 / −3.2 / −3.3 | **kept**, no banding at ×12 gain |
| 4 | **Water mirror every other frame**, a camera cut redraws at once | `?noreflhalf` | −1.5 | −1.4 / −1.1 / −1.0 / −0.3 | **kept**; not judged in motion |
| 5 | **Facade gates**: fetches of weight exactly 0 | `?nofacadegates` | −3 | −0.4 / −1.7 / −0.3 / −0.7 | **kept** |
| 6 | **Land and water gates** | `?nolandgates&nowatergates` | −3 | −1.1 / 0 / 0 / 0 | **kept** |
| 7 | **Water hulls behind a bounding box** | `?nowaterlod` | small | −0.7 / −0.1 / 0 / 0 | **kept**, exact |
| 8 | **Bone palette**: skeleton computed once per figure and frame in a small GPU pass (16 points per figure, 3 RGBA32F targets), falls back to the old path | `?nopedpalette` | −5 market, −3 street (when the geometry shader was unknown) | −0.2 / −0.3 / −0.4 / −0.4 | **kept**: small but in every view, and makes more figures cheaper; the geometry shader was the real cost |
| 9 | Atmosphere: camera end of the integrals per frame, one log2, world ray in the vertex stage | `?noatmofast` | −1 | −0.1 / −0.5 / −0.1 / −0.1 | kept, exact |
| 10 | Far pedestrian vertex program | `?nopedvfar` | −3 | 0 / −0.3 / 0 / 0 (−3.6 was the geometry shader again, before option 1) | kept, entangled with the program's guards and no cost |
| 11 | Sky LUT: Float32 compare never matched, so LUT and CPU twin ran every frame | `?noskylut` | −0.6 | 0 / −0.1 / −0.2 / −0.1 (0.65 by the timer) | **kept**: a bug |
| 12 | Adaptive holds a steady 30 instead of walking to lower resolution | `?noadapt30` | visible quality | see above | **kept** |
| – | Facade footprint level: wall stack skipped on glass, glass under frames, far means of shops and offices | reverted | −3 | ±0.1 / −0.1 → **+0.5 / +0.6 / +0.5** at street, market, oldtown | **rejected, reverted**: slower, 3.7 % larger program, single-pixel changes |
| – | Land footprint level: 17 → 9 samples per field pixel, meadow and gust skipped | reverted | −2 | −0.2 / 0 / 0 / 0 | **rejected, reverted**: 10 % larger program for nothing visible in the frame time |
| – | Mountains after the land in front of them | removed | −1 | −0.1 / 0 / −0.1 / 0 | rejected |
| – | Scene depth 24 bit instead of 32F | removed | −1 | +0.1 / 0 / 0 / 0 | rejected |
| – | Pre-pass of other meshes (masonry, landmarks, harbor, trim, ground, roads, mountains, props) | none | −2 | ±0.3 / roads −1.6, others ≤ ±0.9 / ±1 / ±1 | rejected |
| – | Double clear of the scene target around the shadow pass dropped | none | −1 | +0.1 / +0.05 / +0.3 / 0 | rejected: free already |
| – | Invalidate post targets before drawing (no load) | none | −2 | **+18.4 / +18.4 / +22.5 / +18.3** | rejected: `invalidateFramebuffer` is very expensive on this driver. Do not add it |
| – | Invalidate the screen before the final pass | none | −1 | +6.5 / +6.6 / +6.4 / +6.8 | rejected, same |
| – | Scene depth invalidate after the blit | none | −0.5 | 0 / – / −0.3 ±0.8 / – | rejected |
| – | Leaf cards later in the order (their `discard` could spoil low-res Z) | none | −1 | +0.4 / +0.9 / −0.1 / +0.65 | rejected |
| – | Far trees before the town | none | ? | +0.1 / 0 / 0 / +0.1 | rejected |
| – | Land, far trees and ground triangles sorted near first | none | −2 | land +6.7 at the overview, trees 0, ground 0 | rejected (the land's +6.7 is unexplained) |
| – | Anisotropy 4 → 1 | none | −1 | 0 / −0.2 / −0.6 / −0.8 | rejected: little, and visible |
| – | Shadow: 5 taps with less trig, level-0 fetch, back-face gate | reverted | −1 | 0 / 0 / +0.5 / 0 | rejected |
| – | Static occlusion cells, horizon culler | not built | −2 | 2.5 ns per triangle makes it worth little | rejected by reasoning |
| – | mediump | not built | ? | ANGLE's HLSL ignores precision | rejected by reasoning |
| – | IBL as spherical harmonics | not built | ? | 1–2 taps, changes the look | rejected by reasoning |

**Lessons.** Look for what the driver does behind the API first: option 1 alone is worth more than every shader rewrite together. On this GPU, dynamic branches around exact-zero work repaid far less than the sample and instruction counts predict, and a larger program can be slower. Only A/B counts: the two rejected levels looked excellent on paper.

## Visual checks
- **Blind judges**, 3 agents, 20 pairs baseline vs head with sides randomised, paused clock: overview, downtown, harbor, oldtown, street, market at 12, 18.2, 21.5, plus park and a crowd close-up. Noon: no difference in 7 of 8. Gold: none in 6 of 6. Night: none or nothing structural in 4 of 6.
  - The flags, unblinded and followed up: red beacon glow at night (p04 harbor, p09 downtown) appears once in each build, so it is blink timing. The crowd stipple (crowd close-up at 4 m, near-camera dither on figures and floor) repeats in both builds over 4 reloads, similar strength, so it is not this round.
- **Not judged:** motion. The half-rate reflection during camera moves, and shimmer, were not checked by a judge; `ui-test` passed but looks at no images.
- **Sky:** `?nor11` vs head at ×12 gain, 7, 12, 18.2, 19.3 and 21.5 h: no contour lines with the noise step.
- `?diorama`, `?quality=medium`, `?quality=low` against baseline, read by the lead: no regressions. No console errors, frameErrors 0, invariants `{}`.
- Sheets: `docs/progress/perfdeep/before-after-noon.jpg`, `before-after-gold-night.jpg` (left before, right after).
- Found in both builds, out of scope: at eye level the hem between a figure's shirt and shorts is jagged and speckled (street view, near pedestrian).

## Checks at the head
`npm run typecheck` clean, `npm run build` OK (4.06 MB). `ui-test.mjs --q noidle` 70 passed, `kinds` failed then passed alone (the known flake). `shot.mjs --view overview --invariants --validate --speed 4 --wait 20000`: invariants `{}`, validate `[]`. `soak.mjs` showed a passing pedestrian overlap (commuter vs dogwalker, 4.9 s) in some samples; not compared with a baseline soak, and no pedestrian simulation code changed.

## What remains for a further round
1. Cheap floor under deep sea: land triangles below 3.4 m of water, bound −1.1 overview, −0.6 beach (39 % of land pixels at the overview are sea bed, seen at 6 %).
2. Land far-field albedo bake: up to −3 overview (two 2048² textures); risky for wind and colour.
3. Atmosphere on large far meshes per vertex or LUT: the whole term is 3–5 ms.
4. Facades remain the largest single cost, 8–12 ms: a real rewrite, not gates, and judged by A/B only. Curtain-wall glass is 19 % of the screen downtown.
5. SMAA with a depth early-out (≤ 0.7), interleaved clouds (0.3–0.8), bloom targets as R11 (0.1), shadow static cache (about 1).
6. Triangles: cloth distance gate, far vehicle level, bike racks (60–100 k; little at 2.5 ns).
7. Adaptive: add `scale-0.9` (−4 ms) before anything else, as the first step when 30 is not held. It is the user's call how soft is acceptable.

## Target (set after the first measurements)
**−30 % frame time in all four views at both hours (street 46 → 32, overview 48 → 34, downtown 55 → 38, market 47 → 33), stretch −35 %.**
Evidence: 3–8 ms is removable from waste already found (below). The rest must come from vertex work and facade pixels, which are real visible detail.

## Baseline (eba5730, perf.mjs --gpu 1, 1920×1025, high, ×2 interleaved, AC power)
| view@h | ms/frame | scene | post | shadow | refl | GPU total | dc | tris |
|---|---|---|---|---|---|---|---|---|
| overview@12 | 48.5 | 36.7 | 5.5 | 0.9 | 3.0 | 46.3 | 225 | 3.10 M |
| downtown@12 | 55.1 | 40.3 | 5.5 | 1.3 | 2.2 | 49.5 | 226 | 3.39 M |
| street@12 | 46.5 | 33.2 | 6.5 | 2.6 | 2.0 | 44.6 | 226 | 3.51 M |
| market@12 | 47.3 | 36.2 | 5.3 | 2.4 | 1.2 | 45.2 | 188 | 3.39 M |
| overview@21.5 | 51.7 | 40.2 | 4.9 | 0.8 | 3.3 | 49.4 | 236 | 3.06 M |
| downtown@21.5 | 57.3 | 45.0 | 5.0 | 1.3 | 2.4 | 53.7 | 222 | 3.30 M |
| street@21.5 | 43.5 | 29.8 | 6.1 | 2.5 | 2.2 | 40.6 | 240 | 3.53 M |
| market@21.5 | 45.0 | 34.2 | 5.0 | 2.5 | 1.4 | 43.4 | 199 | 3.41 M |
(The cloud deck and cloud-shadow map count under `post`: they are renderer.render calls with another scene.)

## Where the scene pass goes (splitprof.mjs on eba5730, noon, GPU ms)
Main-view pass scissored to 1×1 px = vertices + binning, with the same LODs (a resolution test would change the LODs):
| view | scene | fragment | vertex + binning |
|---|---|---|---|
| overview | 37.1 | 26.7 (72 %) | 10.4 |
| downtown | 40.2 | 29.7 (74 %) | 10.5 |
| street | 30.1 | 18.7 (62 %) | 11.4 |
| market | 36.3 | 19.8 (55 %) | 16.5 |
So the old "70 / 30" holds from above only: at street level and at the market vertices are 40–45 % of the pass.

Overdraw census (additive constant colour, real depth state and order, then a second pass over the finished depth = visible per draw; discarded fragments not counted):
| view | fragments shaded / screen | wasted | biggest waste (share of the screen) |
|---|---|---|---|
| overview | 1.71 | 0.69 | far trees 0.22, land 0.21, mountains 0.105 |
| downtown | 1.93 | 0.83 | facades 0.20, trim 0.145, leaf cards 0.12, far trees 0.10, masonry 0.06 |
| street | 1.52 | 0.51 | masonry 0.124 (of 0.125: all of it!), cards 0.08, trim 0.05, station 0.045, TV tower 0.044 |
| market | 1.74 | 0.67 | stalls 0.138 + 0.115, furniture 0.09, masonry 0.07, kinetic 0.064 |

Pass timing (framebuffer-bind segments, overview): sky LUT 64² 0.65 (a bug, below), cloud march 0.38, reflection 3.0, shadow 0.9, scene 36.8, depth blit 0.13, AO 1.25, SMAA 1.2, bloom ≈ 0.55, final 1.4. Post is near its floor for these effects.
`?noatmo` (linear fog instead of the aerial perspective): −5.0 / −4.7 / −3.7 / −3.0 ms (overview / downtown / street / market) = the upper bound of the per-pixel atmosphere.
Frame time vs GPU sum: `ms/frame` exceeds the timer sum by 2–6 ms (downtown most); the store of the 64 bpp target at the end of the pass is not inside the queries. Trust ms/frame.


## Tool notes
`scripts/abprof.mjs`: alternating windows in one page, ms/frame, resolves ±0.1–0.4 ms. Reloads give ±1–2 (the market pre-pass read +1.8 by reload, −1.9 by alternating): prefer it for anything switchable at runtime. Clean `perf.mjs` runs with nothing else running reached ±0.1. Editing or typechecking during a run disturbs it: measure on a frozen copy with no agent active.
Vertex ranking before the round: the pedestrian programs were the vertex cost, market 9.1 of 16.9 ms, about 50 ns per triangle; static meshes 2.5 ns. That 50 ns was mostly the geometry shader of option 1.
