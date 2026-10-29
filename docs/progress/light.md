# Light round — "make the light sell the city" (2026-10-29 night, branch claude/light-atmosphere-041e60)

## Resume here
- Branch from 083a507 (= claude/pensive-gates-bim12i). Dev server for this worktree: `npx vite --port 5188 --strictPort --host 127.0.0.1`.
  Harness from the main checkout (shared lock): `node C:/Projects/GameCity/scripts/capture-set.mjs --url http://127.0.0.1:5188/ …`.
- Baseline captures: `shots/light/base/<view>_<hour>.png` (7 views × 7.5 / 12 / 18.2 / 19 / 21.5 h, `?nointro&noidle`, hideui).
  Views: overview; street `5,1.5,-65,9,0,6`; market `27.5,1,78.5,16,200,28`; harbor; platform `-10,1.4,-146.3,6,60,8`; park; oldtown.
- Judge notes (sonnet ×3, per image): scratchpad `judge_day.md`, `judge_dusk.md`, `judge_night.md` (summarised below).
- DONE: resize warnings fixed (postfx.ts). NEXT: item 1 of the ranked list.

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
