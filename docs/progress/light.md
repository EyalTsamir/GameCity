# Light round — "make the light sell the city" (2026-10-29 night, branch claude/light-atmosphere-041e60)

## Resume here
- Branch from 083a507 (= claude/pensive-gates-bim12i). Dev server for this worktree: `npx vite --port 5188 --strictPort --host 127.0.0.1`.
  Harness from the main checkout (shared lock): `node C:/Projects/GameCity/scripts/capture-set.mjs --url http://127.0.0.1:5188/ …`.
- Baseline captures: `shots/light/base/<view>_<hour>.png` (7 views × 7.5 / 12 / 18.2 / 19 / 21.5 h, `?nointro&noidle`, hideui).
  Views: overview; street `5,1.5,-65,9,0,6`; market `27.5,1,78.5,16,200,28`; harbor; platform `-10,1.4,-146.3,6,60,8`; park; oldtown.
- Judge notes (sonnet ×3, per image): scratchpad `judge_day.md`, `judge_dusk.md`, `judge_night.md` (summarised below).
- DONE: resize warnings fixed (postfx.ts, verified: 0 new warnings, no incomplete blits after 4 resizes).
- IN PROGRESS (uncommitted until verified): AO tuning (postfx.ts `strong`, ?aoold, ?aork/?aoik, near fade in
  aoApply.ts), world light key (palette.ts LIGHT_OVERRIDES, ?lightold), curtain-wall mirror (buildings/materials.ts
  uMirror, ?glassold), street-canyon sky visibility (sky/skyVis.ts, ?noskyvis). Lab script: scratchpad lab.mjs
  (one page load, list of {name, view, hours, js}); sheets: scratchpad sheet.py.

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

## Ranked fixes (wow per millisecond)
| # | fix | where | est. cost | status |
|---|---|---|---|---|
| 1 | Light balance by time of day: lower / cooler sky fill in shade, warmer golden key, deep-blue darker blue hour, darker night ambient, weaker softer moon | sky/palette.ts, sky.ts | 0 ms | |
| 2 | Overview haze: clear near, steeper ramp, less mid-range veil | render/atmosphere.ts, sky/atmoDrive.ts | 0 ms | |
| 3 | Night pools: soft radial falloff, no hard-edged quads (lamps + headlights) | core/lampLight, traffic lights | ~0 ms | |
| 4 | Contact shadows at eye level (screen-space, sun direction) + tighter AO near the camera | postfx/aoApply.ts | 0.5–1 ms | |
| 5 | Glass: curtain walls / car glass mirror sky + opposite facades | buildings/materials.ts (minimal), vehicle glass | 0.2–0.5 ms | |
| 6 | Water: sky-tinted Fresnel at dusk, broken reflections, sun glitter | water | ~0.1 ms | |
| 7 | Blue hour: lights on earlier, string lights / lamps glow, window spill | lamps, uLights ramp, bloom | 0 ms | |
| 8 | Shadow edges: stipple / smudges, penumbra | sky/shadowFit, shadow chunk | small | |
| 9 | Grazing-sun sheen on asphalt / stone | ground shaders | 0.1–0.3 ms | |
| 10 | Grade: contrast, vignette, highlight bloom | postfx | 0 ms | |

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
