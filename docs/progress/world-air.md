# world-air — atmosphere, sky, light, optics, grading, adaptive ladder

Owner: **air** agent (world round). Files: `src/render/**` except `src/render/stage/*` (world's), new
`src/render/atmosphere.ts`. Never git-writes; the lead commits.

## Resume here
* 2026-10-24 03:35 — resumed after the weekly stop (tree clean at 582500f). STATE: M1 atmosphere (two
  media: blue air + aerosol, own in-scatter colours, mist, legacy-fog macros), M2 physical sky (LUT +
  CPU twin, skylight MS, golden-hour sky remap), M3 clouds (raymarched half-res cumulus volume + 2D
  cirrus, field cloud shadows), M4 night (Milky Way, town sky glow), optics (lens DOF, sun shafts), grade
  (AgX + subtle golden CDL), ladder (grass/leaf/landscape-tree steps; tested OK, dbg/ladder.json) — all in.
  Best judged sheets: shots/world/air/sky5_sheet.png (sky), g1_sheet.png (golden POIs), sky3_night.png.
* OPEN (lead review): (1) cloud edges must be clean — half-res march grain/streaks → temporal resolve
  (rotation-reprojected history, neighbourhood clamp) [IN PROGRESS]; (2) golden overview: long raking
  shadows + warm-sun/cool-shade contrast → wider world shadow coverage at overview distances at low sun,
  sun stronger/warmer + fill bluer/weaker at 17.5–19 h; (3) sea at 18.2 with world (dome uZenith/uHorizon
  feed the water; uHorizon = haze 120° from the sun).
* Tools: `<scratchpad>/air/cap.mjs` (capture-set copy, 900 s load / 600 s shot timeouts),
  `<scratchpad>/air/skycap.mjs` (free camera "name=camX,Y,Z,tgtX,Y,Z", use only=sky,terrain,landscape,
  water,postfx), render-only typecheck `npx tsc --noEmit -p <scratchpad>/tsconfig.air.json` (20 s),
  probes `<scratchpad>/air/physprobe.ts` / `hazeprobe.ts` (rolldown → node).
* 03:50 lead integration review (int1, code of 10-20 07:30): at 18.2 every city view grey-blue, dim,
  low-contrast ("overcast evening"), lost the warm sunlit facades. Causes found + fixed (typechecks):
  big cumulus coverage (~0.4–0.5) throwing strong cool cloud shadows over the town → evening cumulus
  decay (−0.28·smooth(15.5, 19.2, h)), cloud shadows weaker at a low sun (×0.55…1) + lighter tint;
  golden key too dim/pale after the sepia fix → sun '#ffc98c'/'#ffa962' at 4.5/4.2, fill cooler AND
  weaker (hemiI 0.56, env 0.38/0.36), exposure 1.27/1.32/1.3; grade uSat 1.08+0.07·gold, contrast 0.17.
  Long raking shadows: one VISUAL sun (`_sunVisual` in sky.ts = clock sun lowered by skyElevationDeg at
  golden hour; drives the light/shadows, disc, lobe, LUT, clouds, env, shafts, and is written to
  globalUniforms.uSunDir after main.ts so every shader agrees) + world shadow map out to 950 m.
  Clouds: TEMPORAL RESOLVE in cloudVolume.ts (per-frame jitter, history reprojected by view direction,
  neighbourhood clamp, α 0.14, reset on camera cuts / timejump).
* 04:10 g3 (full city) judged → LEAD APPROVED the golden city light (g3_sheet.png: warm facades, long
  raking shadows, cool shade; riverbend = the reference's mood); noon full city good (g3_noon.png); report
  clean (0 errors, invariants {}, 102–182 dc, 1.8–2.7 M tris). sky6 → temporal resolve gives clean edges.
  Then fixed + verified in sky7 (sky7_a.png / sky7_b.png): cloud shapes (dome cross-section per cell,
  linear height profile ×1.12 so tops never hit the slab ceiling, cells 2 km, thickness 380 + 700·…,
  mip bias log2(t0/7000) ≤ 2 → the far deck recedes to the horizon) = proper fair-weather cumulus;
  visual-sun height drives the light weight (no direct sun after the visual sunset); evening cumulus
  decay gentler (a few clouds catch the sunset); sky brightness × 1.06/exposure (golden sky no longer in
  AgX's grey shoulder); Belt of Venus arch in the dome; lavender anti-sun haze; golden aerosol 5/6.5/8.5e-5;
  upper-sky saturation +0.4·golden.
* g4 judged (g4_sheet.png, FULL city 18.2): overview/vista mid-distance clear, long tree shadows over the
  fields, warm town, blue ridges ✓. Water horizon (dome uHorizon) now 35 % toward the blue air (sea
  read lilac). Lead informed (08:35) that the three open items are verified.
* 08:35 (after the 5th stop; tree clean at 9399c3f) running: sky8 (hz_e/hz_n/up_ne × 18.2/19.5: belt +
  upper-sky saturation), t1 (FULL CITY overview/riverbend/oldtown/coast × 6.3 dawn mist / 19.6 / 21.5).
* NEXT: lens-DOF close-focus check, final report (≤ 350 words) + perf summary.

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

### URL toggles (planned)
`?noatmo` (three's linear fog in world mode, A/B), `?atmo=<k>` density multiplier, `?nomist`,
`?noclouds`, `?nocloudshadow`, `?tiltshift` (force the miniature DOF in world mode), `?nodof`,
`?gradeold` (diorama grade in world mode).

### GPU estimate (high, 1920×1025)
fog chunk ~50–70 ALU per lit fragment (~4 M fragments incl. overdraw) ≈ 0.15–0.3 ms; sky LUT ≈ 0.05 ms per
refresh (rare); clouds in the dome ≈ 0.2–0.3 ms when the sky fills ~40 % of the frame; tilt-shift removed
in far views −0.4…−0.8 ms. Net ≈ 0 … +0.4 ms; 0 extra draw calls (cotton puffs −1 in world mode).

## Milestones
* M1 atmosphere + world dome + world palette + optics/grade — pending
* M2 physical sky LUT + light from the sky — pending
* M3 high clouds + cloud shadows — pending
* M4 night sky — pending
* M5 adaptive steps for others, mist, light shafts (if the sun is in hero frames), polish — pending

## Views used (capture-set `--views`)
`overview;ot_eye=82,1.6,20,10,40,4;river_w=-30,1.6,118,14,95,3;hz=0,30,-20,300,200,8;beach_e=148,2,58,15,-90,4`

## Requests from other areas
* life (via lead): `ctx.services.postfx.softDepth()` → previous frame's scene depth for soft particles.
  Plan: return the composer's stable depth texture (full res, raw depth, blitted after the RenderPass, so it
  is a separate FBO and legal to sample during the next scene pass) + near/far/size of the frame it belongs
  to: `{ texture, linear: false, near, far, width, height } | null` (null while postfx is off). Main view only
  (the water reflection pass has another size → disable the fade there). — in M1.

## Requests to other areas
* world (water): the sea mirrors my dome uniforms (uZenith/uHorizon = the shown physical sky; uHorizon =
  the haze ~120° from the sun). A hot glitter path toward a low sun and a saturated teal/blue body are
  the water shader's; clouds are not in the reflection (the deck is a screen-space volume) — if wanted,
  `cuField()` in sky/cloudLayer.ts gives a cheap 2D cloud mask for a mirrored direction.
* world (landscape): at 19.3 the countryside trees looked noon-bright lime in hz_w (sky3_b.png).
* ui (lead): in world mode the DOF button toggles the natural lens DOF, not tilt-shift — label
  "Depth of field" instead of "Tilt-shift focus" when !DIORAMA.
* life: thin bright diagonal line across the sea in world/m3b coast2_18h2 — likely a kite string.

## Changes outside my area
(none)
