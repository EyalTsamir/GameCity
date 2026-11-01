# world-air — atmosphere, sky, light, optics, grading, adaptive ladder

Owner: **air** agent (world round). Files: `src/render/**` except `src/render/stage/*` (world's), new
`src/render/atmosphere.ts`. Never git-writes; the lead commits.

## Resume here
* 2026-10-24 — **DONE.** All milestones in, lead-approved (g3/g4/sky7); final checks run and judged: sky8
  (belt + upper-sky saturation), t1 full city dawn mist 6.3 / dusk 19.6 / night 21.5 (0 console errors,
  invariants {}), dof1 (lens DOF close focus), dio_check (diorama unchanged). `npm run typecheck` clean.
  No jobs running. Final report below. Only follow-ups: see "Open issues" in the final report.
* Tools (if resumed): `<scratchpad>/air/cap.mjs` (capture-set copy, 900 s load / 600 s shot timeouts),
  `<scratchpad>/air/skycap.mjs` (free camera "name=camX,Y,Z,tgtX,Y,Z"), render-only typecheck
  `npx tsc --noEmit -p <scratchpad>/tsconfig.air.json`.

## History (condensed)
* 10-19: survey, design, M1 atmosphere; m1a/m2a/m2b judged (beige veil = Mie peak in an azimuth-only ring
  → isotropic LUT Mie + analytic sun lobe; white sky → less sky aerosol, ring 3° up).
* 10-19 21:05: world/lead → two-component haze, cumulus placement, landscape.setTreeDetail in the ladder.
* 10-20 01:35–02:30: sepia golden hour fixed (skylight MS, CDL 0.14, cool anti-sun ring, blue-air colour,
  golden key: less aerosol/exposure, bluer fill); raymarched cloud volume (sky4 → sky5 best so far);
  jitter = white noise, 12 steps; golden sky remap gentler (min(7°, 0.6·el)); SKY_MS 0.55.

## Brief (WORLD-PLAN scope 2 + lead notes)
Aerial perspective via a global fog-chunk override (`src/render/atmosphere.ts`: height fog, Rayleigh-blue
distance haze, Mie sun-side warmth, distance desaturation) consistent with a real sky down to the horizon
(world mode: no studio/cyclorama). Real clouds: replace the low cotton balls by a high cumulus/cirrus sky
(1–3 km) with travelling cloud shadows. Light: sun ≈ 5–6× sky fill at noon, deep blue sky, warm golden hour
with long crisp shadows and backlit glow; optional light shafts at low sun. Optics: tilt-shift off in world
mode; natural lens DOF only for close focus; FOV with world (world holds the camera grant). Grading: natural,
less candy saturation, AgX + "Golden" look blend at golden hour, gentle warm/cool split; night with a real
starry sky and distant lights (with world). `?diorama` keeps the original look exactly. I own the adaptive
ladder: steps for the other agents' expensive features through setters they expose.
Budget (high): 0.6 ms GPU, few draw calls.

## Design

### A. Atmosphere — `src/render/atmosphere.ts` (world mode only; `?diorama` = untouched three fog)
* Installed by the sky module before any material compiles: replaces `fog_pars_vertex`, `fog_vertex`,
  `fog_pars_fragment`, `fog_fragment` in `THREE.ShaderChunk`; adds a uniform `thAtmo` (vec4[N]) to every
  `ShaderLib` entry that has fog uniforms and to `UniformsLib.fog`. Its value is ONE shared Float32Array:
  `cloneUniforms` keeps typed arrays by reference (not a three object, not `Array.isArray`), so every
  built-in material and every custom ShaderMaterial that merges `UniformsLib.fog` reads the same live data
  (one `uniform4fv` per material per pass, no per-material bookkeeping). Verified in three 0.186.1 source.
* Model (per pixel, world-space ray camera→P from `vFogView * mat3(viewMatrix)`):
  - haze = aerosol (Mie, grey, scale height ~1.2 km) + Rayleigh (per channel 5.8/13.5/33.1e-6 /m) with
    analytic exponential-height integration (Quilez / UE form, rd.y→0 series);
  - in-scatter colour = the sky's horizon colour in that azimuth (ring of colours relative to the sun,
    shared with the dome → distant land melts into the sky with no seam) + Mie sun lobe
    (HG-like `pow(dot(V,L), g)`, warm haze toward the sun at golden hour);
  - ground mist layer (scale height 4–20 m above the water level, dawn/dusk, wind-drifting patches);
  - distance desaturation (k ≈ 0.35 of the extinction) and contrast loss;
  - reflection pass: the mirrored camera is below the water → heights folded about the water plane so the
    integral equals the real camera→water→object path.
* Legacy inline fog code in custom shaders (`smoothstep(fogNear, fogFar, vFogDepth)`, ~10 additive glow
  shaders of other areas): `fog_vertex` writes a remapped `vFogDepth` (inverse smoothstep of the per-vertex
  extinction) and the scene Fog gets near 0 / far 1, so those shaders follow the new atmosphere unedited.
* JS mirror (transmittance at a distance/height) for post effects: AO fade, cloud-shadow fade.

### B. Sky (world mode)
* M1: dome above the horizon = palette gradient (improved), at/below the horizon = the haze ring colour
  (no studio floor). Sun disc near real size (~0.35° radius instead of 1.3°) + aureole; bloom does the rest.
* M2: physical single-scattering sky (Rayleigh + Mie + ozone, earth shadow) rendered into a small sky-view
  LUT (GPU, re-rendered only when the sun moved); a CPU mirror of the same integral computes the horizon
  ring for the fog uniforms and the hemisphere/env colours → sky, haze and fill light agree by construction.
* M3: clouds — 2.5D cumulus layer (~1.6–2.4 km) + cirrus (~8 km) evaluated in the dome by ray–plane
  intersection from the real camera position (correct parallax), sun-lit edges/dark bases, golden-hour pink
  undersides, aerial perspective; cloud shadows from the same field (camera-centred world map, faded by the
  haze transmittance). `?diorama` keeps the cotton balls and their ellipse shadows.
* M4: night — denser star field with magnitude/colour spread, Milky Way band with dust lanes, airglow,
  city light dome (sky glow) and horizon glow from distant settlements (with world).

### C. Light
* World palette (`WORLD_KEYS`, separate from the studio keys): noon sun ≈ 5–6× fill, deeper blue sky,
  golden hour: amber sun, cool fill, longer exposure lift; physical sun colour from the atmosphere's
  transmittance blended with the authored key (M2).

### D. Optics + grade
* World mode: tilt-shift off. Lens DOF = thin-lens CoC from the camera FOV (35 mm-equivalent focal length),
  f/2.8 — the existing gather blur is reused with K = f²/(N(F−f))/sensorH·H_px; the whole effect (prefilter +
  2 blurs, 0.4–0.8 ms) is skipped when K < 0.6 px (every view beyond ~40 m focus) → a net GPU saving.
* Grade: AgX, lower saturation (1.2 → ~1.0–1.05), natural contrast, AgX "Golden" CDL look blended by
  `dusk` (slope 1/0.9/0.5, power 0.8, sat 0.8 → partially), gentle warm/cool split. Diorama keeps the old grade.

### E. Adaptive ladder (postfx/adaptive.ts)
* Proposal to the lead: every service may expose `setAdaptiveDetail(k)` (k = 1 full … 0.4) — groundcover
  (grass density), vegetation (leaf-card distance), landscape (far detail), life… The ladder gets
  `detail-0.7` / `detail-0.45` steps (after refl-low, before no-ao); postfx calls the setter on every
  service that has it.

### URL toggles (final)
`?noatmo` (three's linear fog in world mode), `?atmo=<k>` haze multiplier, `?nomist`, `?paintsky` (old
gradient sky), `?noclouds` (no cumulus/cirrus/cloud shadows), `?clouds=<0..1>` (fixed coverage),
`?noshafts`, `?tiltshift` (miniature DOF in world mode), `?lensN=<f-number>` (default 1.6), `?gradeold`
(diorama grade in world mode), `?weather=rain|clear`. Diorama: `?diorama` (everything original).

### GPU estimate (high, 1920×1025)
fog chunk ~50–70 ALU per lit fragment (~4 M fragments incl. overdraw) ≈ 0.15–0.3 ms; sky LUT ≈ 0.05 ms per
refresh (rare); clouds in the dome ≈ 0.2–0.3 ms when the sky fills ~40 % of the frame; tilt-shift removed
in far views −0.4…−0.8 ms. Net ≈ 0 … +0.4 ms; 0 extra draw calls (cotton puffs −1 in world mode).

## Milestones
* M1 atmosphere (two media, own in-scatter colours, mist, legacy-fog macros) + world dome + world key +
  optics (lens DOF) + grade — DONE (m2b/sky2…g4)
* M2 physical sky (LUT + CPU twin, skylight MS, golden-hour visual sun, Belt of Venus, exposure-compensated
  brightness) + env bake from it — DONE (sky5…sky8)
* M3 clouds: raymarched half-res cumulus volume + temporal resolve, 2D cirrus, field cloud shadows,
  evening decay — DONE (sky7_a, sky8)
* M4 night: Milky Way, denser stars, town sky glow, moonlit clouds — DONE (sky3_night, t1)
* M5 adaptive steps (grass/leaf/landscape trees, tested), dawn/dusk mist, sun shafts, golden-hour pass
  (lead-approved g3/g4/sky7) — DONE

## Views used (capture-set `--views`)
`overview;ot_eye=82,1.6,20,10,40,4;river_w=-30,1.6,118,14,95,3;hz=0,30,-20,300,200,8;beach_e=148,2,58,15,-90,4`

## Requests from other areas
* life (via lead): `ctx.services.postfx.softDepth()` → previous frame's scene depth for soft particles.
  Plan: return the composer's stable depth texture (full res, raw depth, blitted after the RenderPass, so it
  is a separate FBO and legal to sample during the next scene pass) + near/far/size of the frame it belongs
  to: `{ texture, linear: false, near, far, width, height } | null` (null while postfx is off). Main view only
  (the water reflection pass has another size → disable the fade there). — DONE (postfx.ts), relayed.

## Requests to other areas
* world (water): the sea mirrors my dome uniforms (uZenith/uHorizon = the shown physical sky; uHorizon =
  the haze ~120° from the sun, 35 % toward the blue air). A hot glitter path toward a low sun and a saturated teal/blue body are
  the water shader's; clouds are not in the reflection (the deck is a screen-space volume) — if wanted,
  `cuField()` in sky/cloudLayer.ts gives a cheap 2D cloud mask for a mirrored direction.
* world (landscape): at 19.3 the countryside trees looked noon-bright lime in hz_w (sky3_b.png).
* ui (lead): in world mode the DOF button toggles the natural lens DOF, not tilt-shift — label
  "Depth of field" instead of "Tilt-shift focus" when !DIORAMA.
* life: thin bright diagonal line across the sea in world/m3b coast2_18h2 — likely a kite string.

## Changes outside my area
* `src/core/context.ts` (lead-owned, additive type only): `Services.postfx.softDepth?()` for life.
* Contract nuance (no file change): in world mode the sky module writes `globalUniforms.uSunDir` every
  frame after main.ts with the VISUAL sun (= clock sun, lowered at golden hour by `skyElevationDeg`), so
  every shader's backlight / translucency matches the rendered light. `clock.sunDir` stays the clock's.

## Final report
**What changed (world mode only; `?diorama` pixel-identical, dio_check.png vs dio_base).** Aerial
perspective as a global fog-chunk override: two media (Rayleigh-blue air 8 km + grey aerosol 1 km),
analytic height integral, own in-scatter colours (azimuth ring + warm sun lobe), drifting dawn/dusk mist,
distance desaturation, reflection fold; legacy inline-fog shaders follow via macros. Physical sky (LUT +
identical CPU twin) to the horizon feeds haze, water horizon, env and fill — no seam. Raymarched half-res
cumulus + temporal resolve, 2D cirrus, travelling cloud shadows from the same field, evening decay.
Light: noon sun ≈ 5–6× fill; golden hour with a lowered "visual sun" (long raking shadows, 950 m shadow
map), backlit glow, cool shade, Belt of Venus. Night: Milky Way, stars, town sky glow. Optics: thin-lens
DOF (f/1.6, idle beyond ~40 m), sun shafts at low sun. Grade: AgX + golden CDL. Ladder: grass/leaf/
landscape-tree steps. `postfx.softDepth()` for life.
**Files.** New: `src/render/atmosphere.ts`, `sky/{atmoDrive,physical,cloudLayer,cloudVolume}.ts`,
`postfx/sunShafts.ts`. Edited: `sky.ts`, `sky/{dome,env,palette}.ts`, `postfx.ts`,
`postfx/{look,adaptive,cloudShadow}.ts`; `core/context.ts` (type only).
**Toggles.** See "URL toggles (final)".
**Shots** (shots/world/air/). Before: before/*.png. After: sky7_a/b, sky8_sheet, g3_sheet, g3_noon,
g4_sheet, t1_dawn_dusk, t1_night, dof_sheet.
**Cost.** Full city 102–199 draw calls, 1.7–2.7 M tris. Per frame: +1 cloud march, +1 resolve, +2 shafts
(only near a low sun), LUT rare; −1 cotton puffs, −3 tilt-shift passes when the lens idles → ≈ −1 dc
typical. GPU estimate (high, 1920×1025): fog 0.2–0.35 ms, clouds 0.25–0.35, dome 0.1, shafts 0.15 when
active, minus tilt-shift 0.4–0.8 → ≈ 0 … +0.3 ms. Not measured on the Adreno target (perf.mjs there).
**Trade-offs.** Visual sun deliberately lower than astronomical at golden hour; clouds are screen-space
(not in the water reflection; slight lag on fast pans, reset on cuts); haze colour is azimuth-only;
low quality: 7 steps, ⅓ res.
**Open issues (others).** world: sea body/glitter, white beach block, grey-brown hills; ui: DOF button
label in world mode; life: diagonal line over the sea; ladder thresholds to confirm with perf.mjs on the target.
