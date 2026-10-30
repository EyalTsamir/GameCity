# perf-deep — research all options, reach a real frame-time surplus

Branch `claude/perf-deep-cf97ce`, cut from `claude/pensive-gates-bim12i` @ eba5730. Not pushed or merged here: a coordinator merges.
Dev server: `npx vite --port 5192 --strictPort --host 127.0.0.1`. Frozen baseline eba5730: scratchpad worktree `base` on :5193.
Harness from the main checkout (shared lock), every GPU run behind `scripts/power-guard.mjs`:
`node scripts/power-guard.mjs --out <dir> --cwd C:/Projects/GameCity -- name node scripts/perf.mjs --url http://127.0.0.1:5192/ …`
(`power-guard.mjs` and `splitprof.mjs` were copied untracked into the main checkout's scripts/ to run there: delete after this round.)

## Resume here
State at 15:20 (2026-10-30). Frozen copy of the head: scratchpad cand on :5194 (git checkout --detach <sha>). Baseline eba5730: scratchpad base on :5193. Live tree :5192. A palette agent is editing src/sim/pedestrians (uncommitted: palette.ts, pedestrians.ts, render.ts, shader.ts).
Measured now (head without palette, alternating A/B): overview 40.5, downtown 38.8, street 37–39, market 43 (baseline 48.5 / 55.1 / 46.5 / 47.3).
Next: (1) palette result: compile check, images on/off at speed=0, abprof-style A/B, commit; (2) clean A/B of depth24 (noisy −1 street/market), reflection half rate, atmofast etc. with no agent running; (3) night numbers; (4) visual: blind judges on the hero views at 12, 18.2, 21.5, ?diorama and quality=medium/low; sky banding after the dome noise (scratchpad skyset.mjs, skycmp.mjs); (5) hitch, bootprobe, ui-test, shot invariants, build; (6) ledger, image sheet in docs/progress/perfdeep/, delete main-checkout scripts copies (power-guard, splitprof, abprof), memory note, report in Hebrew.
Ideas not yet tried: SMAA weights with a depth early-out (≤ 0.7 ms), bloom targets as R11 (≤ 0.1), shadow map D16, land far-field bake (≤ 3 ms overview only), atmosphere LUT, canvas depth false, resolution prices for the ladder (quality.renderScale + resize event in abprof), sharpen at scale < 1.

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

## Options measured so far (ms/frame, same-run, frozen copy, ×2 interleaved)
| option | toggle | overview | downtown | street | market | verdict |
|---|---|---|---|---|---|---|
| Scene target R11F_G11F_B10F | `?nor11` | −3.4 | −5.2 | −3.2 | −3.3 | **kept**, banding check pending. The earlier "u8 buys nothing" read only the timers, the gain is partly outside them |
| Facade depth pre-pass with a trivial program | `?noshellprepass` | −1.8 | −6.2 | −0.6 | +1.8 | **kept above 12 m camera height** (`?prepassy=`). The old attempt (colorWrite false on the facade material) still ran the facade shader |
| Water mirror every other frame | `?noreflhalf` | −1.0 | ≈ 0 | ≈ 0 | ≈ 0 | GPU timers −1 ms everywhere; frame time inside the noise, recheck |
| 5 shadow taps: 2 trig instead of 10, level-0 fetch, back-face gate; sky-vis level-0 fetch | removed | 0 | 0 | ≈ +0.5 | 0 | **rejected**: exact but no gain; FXC flattening was not the cost here |

## Tool: abprof.mjs (alternating windows in one page, ms/frame): resolves ±0.1–0.4 ms, reloads only ±1–2. Prefer it for anything switchable at runtime.
Vertex ranking (splitprof --mode vdraws, 1×1 scissor, eba5730): **the pedestrian vertex program is the vertex cost**: market peds 9.1 of 16.9 ms, street 5.7 of 12.7, overview pins 3.4 of 11.4; about 50 ns per triangle against 2.5 ns for static meshes (100 k static triangles = 0.25 ms). So culling static geometry buys little: the horizon culler was dropped before building it. The old "near crowd is per-pixel" was wrong: at the market peds-near is 7.5 ms, 5.7 of it vertices.

## More options measured
| option | toggle | overview | downtown | street | market | verdict |
|---|---|---|---|---|---|---|
| Facade pre-pass, alternating A/B | `?noshellprepass` | −2.1 | −7.05 | −4.4 | −1.9 | **kept in all views** (also harbor −3.3, oldtown −6.7, park −2.2, platform +0.8 ±1.4). The reload A/B market +1.8 was noise |
| Pre-pass of other meshes (masonry, landmarks, harbor, trim, ground, roads, mountains, props) | none | ±0.3 | roads −1.6, others ≤ ±0.9 | ±1 | ±1 | rejected: the facades give it all |
| Scene depth invalidate after the blit | none | 0 | | −0.3 ±0.8 | | rejected |
| Anisotropy 4 → 1 everywhere | none | 0 | −0.2 | −0.6 ±0.6 | −0.8 ±0.7 | rejected: little, and visible |
| Far pedestrian vertex program | `?nopedvfar` | −3.6 | see final | see final | see final | kept (first pass of a noisy run; recheck) |
| Facade gates | `?nofacadegates` | −0.7 | −1.8 | noisy | noisy | kept, recheck |
| Land + water gates | `?nolandgates&nowatergates` | −2.6 | 0 | noisy | noisy | kept, recheck |
| Atmosphere exact savings | `?noatmofast` | ≈ −0.2 | −0.5 | noisy | noisy | recheck |
| Sky LUT Float32 compare bug | `?noskylut` | ≈ −0.5 | 0 | noisy | noisy | kept: bug, also evalCPU every frame |
| Adaptive: hold a steady 30 fps | `?noadapt30` | | | | | kept, verify with soak |
