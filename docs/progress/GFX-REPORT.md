# Graphics overhaul — final report (2026-10-19)

All ten items of the visual audit (2026-10-17) plus the realistic-figures request are implemented,
verified in the browser and committed on `claude/tinyhaven-graphics-audit-l089m8`. Per-area detail,
before/after sheets and toggles live in `docs/progress/gfx-<area>.md` ("## Final report"); the plan,
contracts and budgets in `GFX-PLAN.md`; the lead's QA record in `LEAD.md` ("Phase-3 progress").

## What changed (one line per item)

| # | Item | Result | Owner log |
|---|---|---|---|
| 1 | Flat daylight, smudgy shadows | Warm stronger sun + weak neutral fill (diffuse IBL ×0.6, reflections keep full env), shadows softened in world units (12.5 cm texel at POI distance), amber golden hour, rose dawn | gfx-stage |
| 2 | Night not a showcase | Real light: every static lamp baked into a light map multiplied by surface colour (pools, facade washes, under-lit trees/cars/people/boats), shop spill, harbour masts + moving crane lights, floodlit stadium; darker unlit night ambient | gfx-night, gfx-stage |
| 3 | Grey void, smudges | Oak tabletop + time-of-day cyclorama, slab shadow on the table, aircraft routes moved out of the hero frame | gfx-stage |
| 4 | Plastic water | Planar reflections (1/3 res, high only + adaptive step), Fresnel sky, slicks, depth bands, glitter + capped moon path, hull contact foam, Kelvin wakes | gfx-water |
| 5 | Wallpaper glass | Sky/skyline/neighbour reflections tinted per tower, oil-canning, metallic mullions, lit crowns; blinds no longer shimmer | gfx-buildings |
| 6 | Plastic trees | Distance-faded leaf-clump relief, crown families, birch/poplar/pine, stepped conifers, backlit glow, bark, night readability | gfx-vegetation |
| 7 | Empty hardscape | Resurfacing patchwork, district paving bonds, painted court/bays/hatching, 268 scatter items | gfx-hardscape |
| 8 | Flat facades, sticker windows | Weathering streaks, sill rain marks, darker bases, interiors/curtains that respond to light, roof detail; a pre-existing window-speckle bug fixed | gfx-buildings |
| 9 | Bare gardens, repeated houses | 26 furnished gardens (235 items); 5 house plans × 5 roof types, extensions, dormers | gfx-hardscape, gfx-buildings |
| 10 | Smooth cliffs, flat lawns, box stadium | Layered faceted rock (+ moonlit at night), mown/worn lawns, brick stadium shell with towers and lattice masts | gfx-terrain |
| + | Human figures | One morphing body (man/woman/child/heavy), planted-foot gait with heel-toe roll, clothing/hair/hats, idle & bench poses, 4 LODs; fewer vertices than before; independently re-reviewed ("ship"), then a fix round (corner drag median 6.3→1.8 cm, per-frame garbage ≈2 KB→≈0) | gfx-people, people-review |

## Integration QA (lead)

* Before/after matrix: 11 POIs × 11/18.2/21.5 h + 5 POIs × 6.5/2 h, original (5174) vs new (5173):
  `shots/lead/qa/sheets/*.png`; every capture: 0 console errors, no failed modules, `invariants()` empty.
* Fixed during QA: balloon at cruise height cast a hard dark blot over the town (aircraft shadows now
  fade out with height); water at reflection level 0 (medium/low, adaptive "refl-off") rendered garbage;
  a dark reflection square at dusk; a blown-out moon glint (also present in the original); stadium
  floodlights not snapping on clock jumps. NaN/Inf guards added before bloom/DOF/merge (`?nanviz`).
* Single-file build ✔ (2.60 MB vs 2.20 MB) and it runs from `file://`; typecheck clean.
* Soak 4 min at 4×: heap flat, no errors (one pedestrian-overlap sample; see LEAD.md for the follow-up).
* ui-test: default mode identical to the original (34/35, same pre-existing step); in the full city the
  time-based steps fail on BOTH builds under software GL (frame-rate bound), not a regression.

## Performance — must be measured on the real GPU

This container has no GPU; SwiftShader emulates the GPU on the CPU, so its frame times are raster-bound
and say little about the vertex-bound Adreno. Measured JS cost per frame is small (main render ≈12 ms
JS, reflection pass ≈2 ms JS under SwiftShader). Agents' reasoned GPU estimates (high quality):
water reflection 0.6–1.2 ms (high only, adaptive steps refl-low/refl-off), buildings 0.2–0.4,
vegetation 0.2–0.35, hardscape ~0.2, terrain 0.1–0.2, night ~0.2 at night, stage ~0–0.1 (+ table
0.2–0.5, the largest SwiftShader-visible add after reflections); people cheaper than before.
Draw calls +7–9 (+6–15 inside the reflection pass on high).

On the target machine (dev server running: `npm run dev`):

```
ALL="legacylight&notable&legacylamps&nowaterrefl&wakes=puffs&nohullfoam&legacyfacade&legacyhouses&legacyveg&noscatter&nogardens&legacyground&legacyterrain&legacypeople"
node scripts/perf.mjs --view downtown --hours 12   --width 1920 --height 1025 --variants ";$ALL"
node scripts/perf.mjs --view harbor   --hours 21.5 --width 1920 --height 1025 --variants ";$ALL;nowaterrefl;waterrefl=1"
node scripts/perf.mjs --view overview --hours 12   --width 1920 --height 1025 --variants ";notable;legacyveg;vegcells=8;legacyfacade&legacyhouses"
```

Budget: new work ≤ +2 ms on high, ≤ +0.5 ms on medium/low. Levers if over, cheapest visual cost first:
`vegcells=8` on high (≈4× cheaper clump search), reflection level 1 by default, table off on medium/low.
(`?legacyground` reverts both the hardscape and the terrain ground layers.)

## Decisions and trade-offs

* Legacy A/B toggles and frozen copies are kept on purpose: they are the one-build A/B switch for the
  real-GPU measurement (~100 kB bundle, zero runtime cost when off). Strip after measuring:
  `src/world/vegetation/legacy/`, `src/sim/pedestrians/legacy/`, `src/world/buildings/legacyShell.ts`,
  the legacy branches behind `?legacylight/legacylamps/legacyhouses/legacyterrain/legacyground/legacystadium`.
* Night is deliberately darker; lamps carry the scene, forests/cliffs keep moonlit tops.
* Golden hour/dawn are 8–20 % darker at the median, for contrast.
* Lamp light map has no occlusion (facing + height terms hide most leaks); ≤ 12 moving/scheduled lights.
* Faces stay simple (≈10 px at 14 m); no heels/headscarves/braids yet.
* Known minor items: one near-black conifer near the station; lit tree crowns read as soft blobs in the
  blurred night overview foreground; pond reflects sky only; facade trim not reflected.
