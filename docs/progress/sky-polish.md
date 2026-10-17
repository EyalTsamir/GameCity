# Sky polish (clouds) — progress log

Owner: sky polish agent (final review round). Files: src/render/sky.ts, src/render/sky/* (mainly clouds.ts).
Read-only: src/render/postfx/cloudShadow.ts (perf agent owns postfx*; no change needed there).

## Brief (from the lead's review, shots/review1/overview_{11,18h2,21h5}.png)
1. Hero overview: puffy clouds float low over the city (downtown, Westbrook, stadium, old town, harbour).
   → clouds should FRAME the model: periphery / beyond the slab edges, higher; at most an occasional small
   one over the city. Cloud shadows must stay consistent with the cloud positions.
2. Night: clouds become flat grey-blue "fog stains" over the lit city → subtle, translucent, darker, faint
   moonlit rims; dusk keeps its pink/orange glow.
3. Check dawn 6.5, golden hour 18.2, late night 2 for other sky oddities (fix only what is clearly wrong).

## Analysis (why the old layout failed)
* Overview camera ≈ (222, 360, 349) looking NNW at 40°. A cloud at altitude h hides the ground point behind
  it (ray → y=0). At 96–132 m every cloud over the SE half of the slab sat in front of the city.
* The wind (uWind 0.8,0.35 → ESE) blows almost straight at the hero camera: with wrap-around drift every
  cloud eventually crosses the city in the picture; no drift direction avoids that → needs a lifecycle.

## Design (clouds.ts rewrite, done)
* Clouds drift along planned straight paths (wind ± up to 26° shear). plan(): anchor = random pixel of the
  hero picture → ray → cloud altitude (86%) or anywhere around the model (14%); rejected if it hides the
  city from the hero camera; path extended up/downwind while it keeps framing (coverage() < 0.05).
* Lifecycle: puffs bubble up (staggered per puff) on the upwind part, fully formed around the anchor,
  dissolve before the downwind end (= before it would drift in front of the city), rest 3–25 s, re-form.
* 1 "passer": small (0.5–0.62), high (172–192 m) cloud that crosses the city now and then (rests 80–240 s).
* Altitude 128–168 m (was 96–132); 20 clouds (was 14), size 0.92–1.36.
* Other cameras: coverage() from the current camera thins clouds in front of the slab to a wisp (12 %,
  passer 55 %) — replaces the old screen-centre heuristic.
* Shadows: same positions / footprint / formation (life) as the puffs. Only clouds whose shadow can reach the
  slab are sent; with > 16 (MAX_CLOUDS) the nearest win (sim: noon median 11, max 15; golden hour ~2).
* Night (sky.ts cloudNight = smooth(-0.07,-0.30,sunHeight): 0 until the pink afterglow ~19.8 h, 1 by ~21 h):
  body ×0.4, opacity 0.93→0.35, faint moonlit rim (uMoonRim / uRimAlpha).
* Offline check: node <scratchpad>/simclouds.ts (imports clouds.ts directly) → hero frame: median 6 clouds,
  0 % in the picture centre, ~30 % top-left, ~17 % top, ~35 % top-right, ~10 % bottom-left.

* Passer is dormant at load (clean first impression), rests 200–480 s between passes, flies ×1.25,
  stays 85 % opaque over the city (a crisp little cloud, not a grey smudge).
* Night city uplight (warm belly tint) only on clouds above / near the model (per-instance aCloud.w).
* GPU: per-puff frustum culling + mesh.count = visible puffs (dormant / off-screen clouds cost nothing).

## Done
* before-set: shots/sky2_before/<view>_<hours>.png (overview, downtown, beach × 6.5/11/18.2/21.5/2)
* iterations: shots/sky2_iter1..4 (iter3 = top-down + north views: no cloud hides the city)
* perf A/B (same perf.mjs session, temporary ?cloudsLegacy variant with the original code, since removed):
  overview 12h 1300×930: new 24.06/23.97/24.42/24.42 ms vs legacy 25.09/25.13/23.94 ms → equal or
  ~0.5 ms cheaper; ~12k fewer triangles. (Another agent's change landed mid-run: 145→125 dc.)
* tsc clean for sky files (whole project typechecks per the lead's 14:47 check).
* FINAL after-set (final code, 12:37): shots/sky2_after/<view>_<hours>.png, report.json clean (0 errors /
  warnings, no failed modules, invariants clean). Named copies: shots/sky2_overview_{11,18h2,21h5,2,6h5}.png,
  shots/sky2_downtown_{11,21h5}.png, shots/sky2_beach_{11,18h2}.png.
  vs shots/review1: no cloud over downtown / Westbrook / stadium / old town / harbour at 11 or 18.2;
  night = faint translucent shapes, no grey stains over the lights. POI close-ups unchanged (cameras are
  below the cloud layer — as before).
* final perf (lead's command, 14:5x, idle machine): overview 12h → 12.94 / 13.6 ms, 144 dc, 0 errors.
* task 3 (dawn 6.5 / golden 18.2 / late night 2): no other clearly-wrong sky issue found; dome/palette untouched.

## Status: DONE (final report sent)

## Known issues / notes
* Grey smudge beside the HARBOUR label in midday overview shots = the docked ship's funnel smoke
  (harbor.ts emitter via ambient, colour #8f8c88) — present before too; owner could lighten it.
* Night moon-glitter path on the sea (beach view) is strong — water module, unchanged by this work.
* Composition is designed for the overview POI (computed from plan.pois at load, so it follows POI edits).
  From other high orbit angles clouds in front of the slab thin to 12 % wisps, so fewer read as clouds there.
* sky stats: cloudsOverCity counts clouds above the slab in WORLD space — framing clouds hover over the
  north / west part at 128–168 m and appear beyond the back edge in the hero picture, so >0 is normal.
* The passer (1 small high cloud) does cross the city now and then by design (85 % opaque, ~1 in 3 of the time).
