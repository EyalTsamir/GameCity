# Light round — "make the light sell the city" (2026-10-29 night, branch claude/light-atmosphere-041e60)

## Resume here
- Branch from 083a507 (= claude/pensive-gates-bim12i). Dev server for this worktree: `npx vite --port 5188 --strictPort --host 127.0.0.1`.
  Harness from the main checkout (shared lock): `node C:/Projects/GameCity/scripts/capture-set.mjs --url http://127.0.0.1:5188/ …`.
- Baseline captures: `shots/light/base/<view>_<hour>.png` (7 views × 7.5 / 12 / 18.2 / 19 / 21.5 h, `?nointro&noidle`, hideui).
  Views: overview; street `5,1.5,-65,9,0,6`; market `27.5,1,78.5,16,200,28`; harbor; platform `-10,1.4,-146.3,6,60,8`; park; oldtown.
- Judge notes (sonnet ×3, per image): scratchpad `judge_day.md`, `judge_dusk.md`, `judge_night.md` (summarised below).
- DONE: resize warnings fixed (postfx.ts, verified: 0 new warnings, no incomplete blits after 4 resizes).
- Committed: 53d507d (AO, light key, glass, sky visibility, dusk sea, shadow fit, grade, headlights), 31f7738 (lamp
  specular, exposure metering, asphalt sheen, GLSL name fix), a129da4 (uMirror moved off box-hunt's lines), 71ea293
  (round 3: lamp specular widened + soft-capped — fixes the aerial night bloom balls of round 2 —, env specular ×1.7
  with diffuse IBL ÷1.7 `?envold`, night fill 0.36 → 0.42, 7.8 h fill 0.58 → 0.64, grade contrast 0.21 / lift back
  up, canyon sun bounce alive at a low sun).
- STATUS: round complete. Final captures `shots/light/final` (same 35 as base), before/after sheets per hour
  `shots/light/sheets/before_after_<hour>.jpg`. Verified: console 0 errors (7 pre-existing ANGLE warnings, same as
  base), invariants {} in every capture run, full-city `ui-test --q noidle` 54/54 (incl. the 3 resize-layout steps,
  no blit warnings), stand-in ui-test, typecheck. In the long ui-test run the PEDESTRIAN invariant flagged a paused
  family group overlapping (parent vs family, 23 s at (48.9, 63)) — sim, untouched by this round → follow-up for
  pedestrians. Judges: rounds 1–2 below; round 3 checked by eye on lab sets (scratchpad r3a / r3b_envold / r3c).
- Possible next steps (not started): sun-side warm haze in overviews, softer water reflections at golden hour,
  canopy translucency (vegetation), wet-street variant at night, lamp switch-on a little before sunset.

## Judgement (baseline) — what gives it away as CG
Day (7.5 / 12 h): objects float (no contact darkening under bikes, benches, stalls, cars, people, wall bases); glass towers
and shop windows are flat teal / beige — no sky or opposite-facade reflection; shade is the same hue as sun, only darker
(no cool skylight) and too bright vs the sun; the 7.5 h "golden hour" reads as a neutral hazy morning (street fully in
flat shade); haze is a uniform veil over the overview (city already washed out at noon); water reflections are crisp
planar copies; no specular on asphalt / stone / metal; low global contrast.
Dusk (18.2 / 19 h): blue hour is brown-lilac and too bright, not deep blue; water stays bright turquoise at 19 h; lamps,
string lights, headlights don't glow or light the ground yet; direct sun still paints hard orange patches at 19 h.
Night (21.5 h): lamp / headlight pools are hard-edged projected quads; moon shadows too strong and hard; ambient fill
too high and flat (no real black); no window spill on pavements; glass reads like daytime texture; no lamp glitter in
water; halos identical hard discs; the 19 → 21.5 h switch-on is abrupt.

## Judgement round 2 (base vs r2, sonnet ×3)
- Day: 7.5 h better (mirrored curtain walls, cooler shade, deeper contact AO, warmer longer sun), 12 h slightly better.
  Mild: low-sun shade crushes (street_7h5 asphalt, platform benches), awnings look self-lit against darker ground.
- Dusk: 18.2 h better (deep slate sea with sky mirror instead of turquoise plastic, canyon depth), 19 h clearly
  better (lavender sea matching the sky, violet shade). Mild: shade crushes to navy at 18.2 (street, oldtown, market).
- Night: eye level better (no moon patches, soft pools, real black fields), but REGRESSION in every aerial night
  view: lamps bloomed into 80–250 px halo balls (lamp specular: a mirror-sharp GGX lobe right under each head seen from
  above, × the night bloom) → fixed in round 3. Mild: overview / platform darks crushed.
- Remaining tells (all three): uniform haze with no sun-side warmth; dry diffuse pavements; flat-lit canopies; water
  reflections too sharp; lamps switch on late (19 h has no pools); shade without coloured bounce.

## Ranked fixes (wow per millisecond)
| # | fix | where | est. cost | status |
|---|---|---|---|---|
| 1 | Light balance by time of day: lower / cooler sky fill in shade, warmer golden key, deep-blue darker blue hour, darker night ambient, weaker softer moon | sky/palette.ts, sky.ts | 0 ms | done (?lightold) |
| 2 | Overview haze: clear near, steeper ramp, less mid-range veil | render/atmosphere.ts, sky/atmoDrive.ts | 0 ms | not done: judged acceptable on re-look (morning haze reads natural); the world round's sky/fog seam calibration was not worth the risk |
| 3 | Night pools: soft radial falloff, no hard-edged quads (lamps + headlights) | core/lampLight, traffic lights | ~0 ms | done: moon 0.5 → 0.2 (it made the hard patches), gaussian headlight pools |
| 4 | Contact shadows at eye level (screen-space, sun direction) + tighter AO near the camera | postfx/aoApply.ts | 0.5–1 ms | done differently: N8AO retuned (?aoold) + street-canyon sky visibility (?noskyvis) + metering |
| 5 | Glass: curtain walls / car glass mirror sky + opposite facades | buildings/materials.ts (minimal), vehicle glass | 0.2–0.5 ms | curtain walls done (?glassold); car glass already mirrors a street model (vehicleMaterial thStreetRefl) — unchanged |
| 6 | Water: sky-tinted Fresnel at dusk, broken reflections, sun glitter | water | ~0.1 ms | dusk sea done (?waterold) |
| 7 | Blue hour: lights on earlier, string lights / lamps glow, window spill | lamps, uLights ramp, bloom | 0 ms | lamp specular sheen — opt-in `?lampspec` since r5 (1–2 ms for a faint streak); switch-on unchanged (core/time.ts: sun < 2.9°; at 19 h the lamps are on but invisible against daylight, as in photographs) |
| 8 | Shadow edges: stipple / smudges, penumbra | sky/shadowFit, shadow chunk | small | eye-level fit 14 → 10 cm texels (?shadowold) |
| 9 | Grazing-sun sheen on asphalt / stone | ground shaders | 0.1–0.3 ms | asphalt roughness 0.8–0.95 → 0.72–0.92; env specular ×1.7 (?envold) gives grazing sky sheen on all paving |
| 10 | Grade: contrast, vignette, highlight bloom | postfx | 0 ms | done (?lookold; r3: contrast 0.21, lift halfway back) |

## Perf (perf.mjs, 1920×1025, 12 h, high, adaptive off, 2 repeats in one run — ms per frame, headless on the Adreno)
| variant | street (eye level) | overview | market |
|---|---|---|---|
| all light-round changes (baseline row, run 1) | 42.9 | 49.7 | 52.2 |
| `?noskyvis` | 41.9 / 42.1 | 48.6 / 48.3 | 50.8 / 50.8 |
| `?aoold` | 42.9 / 42.8 | 49.7 / 49.9 | 52.6 / 52.0 |
| `?glassold&shadowold` | 43.2 / 42.7 | 49.6 / 49.8 | 52.1 / 52.0 |
→ sky visibility ≈ 0.9–1.4 ms (one dependent texture fetch + a matrix per lit fragment; the only feature with a real
cost — off on the low tier), retuned AO / glass / shadow fit ≈ 0 (within noise). The run-2 baseline row (33 / 47 / 47 ms,
1 console error) is discarded: a file was being edited mid-run and Vite served a half-saved materials.ts.
Round 3, night A/B (21.5 h, 2 repeats, ms/frame): street 46.1 / 44.8 baseline, 44.9 / 43.5 `?nolampspec`,
44.8 / 44.7 `?envold`; oldtown 62.9 / 61.6, 61.1 / 60.9, 61.7 / 61.4 → lamp specular ≈ 0.7–1.3 ms at night (a GGX
evaluation on every lamp-lit Standard fragment; candidate for a medium-tier switch), env ×1.7 ≈ 0 (uniforms only).
Stutter check (`hitch.mjs`, 5 views × 12 / 18.2 / 21.5 h, `shots/light/hitch.json`): 0 mid-run shader compiles in every
window (all light-round patches go in before main.ts' precompile / warmUp). Freezes > 100 ms appeared only in the
21.5 h windows late in the run (market up to 616 ms); the night perf A/B in one session (perf3) shows such spikes
landing at random on any variant — the first page load, `?noskyvis`, and the all-toggles-off variant alike — i.e.
external GPU load (sibling sessions), not a light-round cost. Steady night cost of the whole round: market +2.7 ms,
oldtown +2.2, harbor +2.0 (lamp specular ≈ 1–1.4, sky visibility ≈ 1–1.5). Round 4: lamp specular faded out by
90 m from the eye and skipped beyond (aerial nights pay nothing), off on the low tier.
Round 5: a cheap lobe (GGX D, Kelemen visibility, Schlick) on ground-facing surfaces only still cost (perf5, 3 repeats,
GPU ms) street +1.8, market +1.1, oldtown +2.3 — even aerial, where nearly every fragment skips the branch: the cost is
keeping the lamp term (thLampSE / thLampSL) alive in every uber-shader, not the lobe. For a streak the judges called
barely visible that is poor value → the lamp specular is OFF by default, `?lampspec` turns it on (never on low).

## Log
- Resize warnings (`ui-test --steps resize`, ~120 × `glBlitFramebuffer … not all the same size`): traced with a
  blitFramebuffer wrapper — the DRAW framebuffer (the composer's stable depth target) was
  FRAMEBUFFER_INCOMPLETE_DIMENSIONS. `RenderTarget.setSize` doesn't resize a depth texture's image; the soft-particle
  shaders sample the stable depth texture in the next scene pass before its target re-attaches it, so three allocated
  its immutable storage at the old size (texture dims aren't in three's texture cache key) and the per-frame depth blit
  failed from then on — after any window resize AND after any adaptive render-scale step (stale depth for the DOF,
  sun shafts and soft particles). Fix: `postfx.ts` resize() sets the three depth textures' image size with the buffers.
- AO: in a headless session the adaptive ladder stays at 'full' (capped, gpuMs ≈ 46): N8AO is ON in the captures,
  yet at eye level it was invisible (1.6 m radius, ×2.4). Lab: radius ×2 / ×1.5 grounds cars, kerbs and wall bases;
  ×3.5 / ×2 is grainy. New world values: radius clamp(dist·0.03, 2.6, 12), intensity 3.3 + 0.5·far, faded in by view
  depth (0.5 r → 1.4 r) because a wide radius right in front of the camera is blotchy N8AO noise (inside the tower lobby).
- Palette alone (bluer sky fill, warmer morning, deep-blue blue hour, darker night): subtle at eye level — the flat
  street-canyon shade is structural (no sky occlusion), hence skyVis.
- Sky visibility (`src/render/sky/skyVis.ts`, `?noskyvis`, off on low): lot heights rasterised on a 2 m grid (slab + 40 m),
  12-azimuth horizon march to 64 m at 0 / 6 / 15 / 30 m → RGBA8 texture; three's `lights_fragment_begin` /
  `lights_fragment_maps` patched once (sky module, before any material compiles) so the hemisphere light and the
  diffuse IBL of every built-in lit material are × the factor (sampled 1.5 m out along the normal; 0.85 strength),
  plus a warm sun bounce ∝ (1 − V). Uniforms go into ShaderLib.{lambert,phong,standard,physical,toon} and
  UniformsLib.lights (cloned per material at its first compile — static values only). First look (downtown 18.2,
  park 12, street 18.2): the streets between the towers fall into shade the way a photo's do; the open park and
  roofs unchanged.
- Glass (`buildings/materials.ts` uMirror, `?glassold`): curtain walls F0 0.26 → 0.32, coating tint of the
  reflection 0.72 → 0.42, ×0.8 → ×0.92; ribbon glass 0.2 → 0.24 / 0.5 → 0.36; curtain walls up to 32 m now also
  run bhOpp (the street + facades across, per pane with parallax) like punched windows. Towers stop reading as flat
  mint/teal; at 18.2 they carry the warm sky.
- Night: the "hard-edged pools with straight terminators" were mostly MOONLIGHT (sunI 0.5, crisp building shadows)
  painting bright patches across the lamp-lit town — moon 0.5 → 0.2, night fill 0.5 → 0.36 (palette LIGHT_OVERRIDES).
  Headlight pools (traffic/render.ts poolTexture): gaussian across, peak a few metres ahead, long fade (was a sine
  plateau that read as a lit quad); scooters' pool car-width (was a torch streak).
- Dusk sea (`water/surface.ts` TH_DUSKSEA, `?waterold`): golden hour → blue hour the body darkens toward deep blue
  (was boosted to a bright teal), the sea mirrors the dusk sky (F cut 0.38·gk → 0.1·gk), body glow 0.3 → 0.1.
- Eye-level shadow fit (`sky.ts`, `?shadowold`): radius clamp(d·1.75 + 90, 105, 950) (was d·1.6 + 120, ≥ 140) →
  texels ≈ 10 cm instead of 14 at street level; aerial distances unchanged.
- Grade (`postfx.ts`, `?lookold`): S-curve 0.17 → 0.23, lift halved, vignette 0.16 → 0.2.
- Lamp specular (`core/lampLight.ts` patchLampSpecular; was `?nolampspec`, now opt-in `?lampspec`): GGX from the lamp map's virtual lamp, added
  after the integrations' thLampLight call. Round 2 showed the trap: right under every head, seen from above, H ≈ N and
  a smooth surface (or the lamp's own glass) gave a mirror-sharp peak that the night bloom turned into 80–250 px balls
  over park / oldtown / market / harbor. Round 3: the lamp lobe uses roughness ≥ 0.5 (the virtual lamp is heads half a
  metre wide smeared over metres) and a soft knee at 0.45 × the lamp light's luminance. Eye level keeps a soft streak
  along the asphalt toward the camera; aerial nights are clean again.
- Env specular (`sky/iblPatch.ts` ENV_SPEC 1.7, `?envold`): the PMREM is in the dome's own units, so environment
  intensity ~0.5 mirrored the sky at half its brightness. Specular × 1.7, diffuse IBL ÷ 1.7 (unchanged ambient; for
  Lambert / Phong the scene env is cube-UV, so only their diffuse IBL reads it and the factors cancel). Visible as a
  cool grazing sheen on shaded paving (platform shade +11 % in the distance), otherwise within ±1 grey level.
- Round 3 balance (judges: shade crushes to navy): night fill 0.36 → 0.42, 7.8 h fill 0.58 → 0.64, grade contrast
  0.23 → 0.21 with the lift halfway back, vignette 0.2 → 0.19 (+0.12·night), canyon sun bounce
  0.07 · (0.4 + 0.6 · sun height) instead of 0.06 · sun height (a low sun lights the facades that face it).
- Not mine / follow-ups seen on the way: the platform rock cutting's material is speckled under grazing sun (terrain
  rock detail, visible at 18.2 h when no train stands in front); water reflections stay fairly sharp at golden hour.
