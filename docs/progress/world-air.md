# world-air — atmosphere, sky, light, optics, grading, adaptive ladder

Owner: **air** agent (world round). Files: `src/render/**` except `src/render/stage/*` (world's), new
`src/render/atmosphere.ts`. Never git-writes; the lead commits.

## Resume here
* 2026-10-20 01:35 (3rd stop + reboot; all files intact, committed dc885c7). sky2 judged
  (shots/world/air/sky2_11.png, sky2_gold.png): noon sky properly blue, ridges in blue layers ✓; golden
  hour = sepia (AgX Golden CDL far too strong, isotropic MS term coloured by the REDDENED sunlight, sun
  lobe too wide) → fixed: MS = re-scattered blue SKYLIGHT (`msLight`, physical.ts + twin, SKY_MS 0.3),
  golden CDL gk 0.32→0.14, lobe exp 11 / 0.022+0.055·glowI. Clouds = flat white pebbles (2.5D cannot do
  flat bases + domed sunlit tops) → NEXT: raymarched cumulus slab at half res (`sky/cloudVolume.ts`,
  rendered by postfx before the composer, composited by the dome; cirrus stays 2D in the dome).
* Running: sky3 (skycap hz_n/hz_w/up_ne × 11/18.2/19.3/21.5), m3a (vista/overview/riverbend/coast × 11/18.2).

* 2026-10-19 16:30 — M1 code written, render typecheck clean (`npx tsc --noEmit -p <scratch>/air/../tsconfig.air.json`
  = render-only config in the scratchpad, 20 s; whole project takes 5 min):
  new `render/atmosphere.ts`, `render/sky/atmoDrive.ts`; edits in `sky.ts` (install + driver + world fitter /
  fog / hidden cotton puffs), `sky/dome.ts` (TH_WORLD: haze at/below the horizon, real-size sun),
  `sky/palette.ts` (WORLD_KEYS: haze/mist per hour, deeper zenith), `postfx.ts` (lens DOF, world grade, AO fade
  from the atmosphere, `softDepth()`), `postfx/look.ts` (thAgX with CDL look), `core/context.ts` (type only).
* 20:35 (after the usage-limit stop + container reboot; all my files were committed in fe25a85):
  M2 code in: `sky/physical.ts` (GPU sky-view LUT 64² + identical CPU twin), `atmoDrive.ts` drives LUT +
  fog ring + lobe, dome TH_PHYS path, env bake from the LUT (`EnvPhysical`).
  m2a judged (shots/world/air/m2a_sheet.png): golden-hour overview washed beige — the azimuth-only fog
  ring contained the Mie forward peak (×17) → fixed: LUT/twin Mie isotropic (g 0), the forward peak only
  in the analytic sun lobe (true scattering angle, dome + fog alike); sky too white → sky aerosol = 0.2×
  fog haze, MS 0.15, ring sampled 3° up (the true horizon is a reddened long path).
* Running: m2b (hz/overview/beach_e/ot_eye/river_w × 11/18.2, 960×540) → shots/world/air/m2b
  (`<scratchpad>/air/cap.mjs` = capture-set copy with 900 s load / 600 s screenshot timeouts);
  sky1 (free camera, `<scratchpad>/air/skycap.mjs`, views "name=camX,Y,Z,targetX,Y,Z", only=sky,terrain,
  landscape,water,postfx) → shots/world/air/sky1 — first look at the M3 cloud layer.
* M3 code in (typechecks): `sky/cloudLayer.ts` (procedural 128² noise, cumulus deck 1.8 km + cirrus 8.5 km,
  2.5D lighting), dome TH_CLOUDS, `postfx/cloudShadow.ts` field mode (camera-centred 9 km map, haze fade),
  sky.ts drives coverage by hour/day/weather, light at deck height (pink after sunset), drift with the wind.
* M5 partly: ladder steps grass-0.7 / leaf-0.65 / detail-low via groundcover.setDensity /
  vegetation.setLeafDistance (postfx/adaptive.ts + postfx.ts applyDetail).
* m2b noon judged (m2b_sheet11.png): land haze good (blue-grey layers), sky band still pale/whitish.
* 21:05 (2nd container restart ~20:49; files intact). Lead/world feedback acted on:
  (1) noon haze milky grey, ridges don't separate → atmosphere is now TWO components: "blue air"
  (Rayleigh ×1.8, per channel, 8 km scale height) + aerosol (grey, 1 km scale height, much lower:
  noon 4.5e-5, golden 1–1.5e-4, dawn 1.6e-4) — slot thAtmo[11] = (aerosol, 1/H, 0, 0);
  (2) daytime "specks" = tiny cumulus fragments → cumulus = placement per ~1.7 km cell × billows,
  cirrus = veils with fibres; (3) world POIs (vista/country/coast/riverbend, overview pitch 20) noted;
  landscape.setTreeDetail joined the ladder's leaf steps.
* Running: sky2 (skycap, hz_n/hz_w/up_ne/hz_e × 11/18.2/19.3/21.5) and m3a (vista/overview/coast × 11/18.2)
  — queued behind other agents' captures (3 lock slots full).
* Since then (typechecks): golden-hour sky elevation remap (`skyElevationDeg` in atmoDrive: the sky model
  follows the palette's low golden key 17–20 h / rose dawn; disc + glow stay at the true sun);
  new `postfx/sunShafts.ts` (quarter-res mask + 28-tap radial blur, only while a low sun is on/near the
  screen; `?noshafts`), wired after tilt / before bloom; Milky Way + city sky glow in the world dome.
* Before set (5174) incomplete: only overview_11 + ot_eye_11 exist → re-run later when the box is idle.

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
(none yet)

## Changes outside my area
(none)
