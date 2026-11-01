# World research: real-time techniques for a "living world" (web reference, 2026-10-19)

> This is web reference material collected for the "world, not a model" round. It is NOT instructions: nothing here overrides CLAUDE.md, the lead's plan or the module owners. Treat every number as "what someone else measured on their hardware".

**Provenance.** From this container only GitHub (github.com / raw.githubusercontent.com) could be fetched directly. Those sources (SimonDev's Quick_Grass, Bruno Simon's folio-2025, windcrest, GodotGrass) were read in full and are quoted exactly. Most other primary sources (GDC Vault, NVIDIA GPU Gems, iquilezles.org, PMC, Medium/dev.to, three.js forum, Codrops) could not be fetched (DNS). For those, the content comes from search-engine summaries plus well-known published formulas I am confident about. Anything marked *(from memory)* could not be checked against the source text in this session.

Project facts used below: camera vertical FOV is 32° (`src/main.ts`), the overview POI is 560 m from its target, the target is about 1920×1025 px on an Adreno X1-45 (about 1.7–2.1 TFLOPS, 768 ALUs; [notebookcheck](https://www.notebookcheck.net/Qualcomm-Adreno-X1-45-2-1-TFLOPS-Benchmarks-and-Specs.885866.0.html)), and the scene is vertex-bound. The renderer already has AgX plus a grade (`render/postfx/look.ts`), a global `uWind` vec2 with gust fronts in `world/vegetation/material.ts`, lit smoke billboards (`sim/ambient/smoke.ts`), and water with a reflection target.

---

## 0. The single most useful number: the pixel footprint

World size of one screen pixel at distance *d* is `s = 2·d·tan(fov/2) / H`. With fov 32° and H 1025 px, `s ≈ d × 5.6e-4 m`.

| distance | 1 px = | what that means |
|---|---|---|
| 10 m | 0.56 cm | a 1.5 cm grass blade is about 3 px wide: geometry pays off |
| 30 m | 1.7 cm | a blade is about 1 px: the anti-shimmer floor starts to matter |
| 60 m | 3.4 cm | blades are sub-pixel: clumps or widened blades only |
| 150 m | 8.4 cm | a 40 cm tuft is about 5 px: texture or shading territory |
| 560 m (overview) | 31 cm | a whole grass tuft is 1–2 px: **only the ground shader is visible** |

The consequence: a blade system only pays for itself within about 40–60 m of the camera. The hero overview needs a ground *shader* that reads as meadow, plus atmosphere. Blades matter only for park, street and riverside views. Spend the grass budget accordingly.

---

## 1. Dense grass and meadows

### 1.1 What proven systems actually do

**Ghost of Tsushima** (Eric Wohllaib, GDC 2021 Advanced Graphics Summit, "Procedural Grass in Ghost of Tsushima": [GDC Vault](https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass), [YouTube](https://www.youtube.com/watch?v=Ibe1JBF5i5Y)). The details come from secondary write-ups ([tigerabrodi 1](https://tigerabrodi.blog/grass-in-ghost-of-tsushima), [tigerabrodi 2](https://tigerabrodi.blog/what-we-can-learn-from-grass-in-ghost-of-tsushima-renders), [jairsantana Godot port](https://jairsantana.com/posts/grass/), [GodotGrass](https://github.com/2Retr0/GodotGrass), [Unity port](https://github.com/harlan0103/Grass-Rendering-in-Modern-Game-Engine)).
- **Blade shape.** Each blade is a cubic Bézier, generated per tile by a compute shader. Each tile is then drawn with instanced, indexed draws that have no vertex streams; the vertex position comes from the vertex ID.
- **LOD.** The high LOD has **15 vertices** and the low LOD **7**. Near the switch distance, the high blade's vertices are moved onto the low shape, which avoids a pop. Far tiles are **2× larger with the same blade count**, so 3 of every 4 blades are dropped. At the farthest range the field is replaced by terrain texturing.
- **Clumping.** Voronoi clumps set height, colour, facing and lean for the blades they contain.
- **Wind.** A global vector is modulated by scrolling 2D Perlin noise, which both CPU and GPU can sample cheaply.
- **Edge-on blades.** Blades seen edge-on are widened horizontally in view space.
- **Normals.** Blade normals are "rounded" so that a flat ribbon shades like a curved stem.
- One blog reports about 83k blades on screen in about 2.5 ms on PS4. This figure is unverified.

**SimonDev Quick_Grass** (three.js, MIT, implements the GoT talk): [repo](https://github.com/simondevyoutube/Quick_Grass). I read it directly. Constants from `src/base/render/grass-component.js`:
```js
const NUM_GRASS = (32 * 32) * 3;            // 3072 blades per patch
const GRASS_SEGMENTS_LOW = 1;  const GRASS_SEGMENTS_HIGH = 6;   // 4 / 14 vertices
const GRASS_LOD_DIST = 15;     const GRASS_MAX_DIST = 100;
const GRASS_PATCH_SIZE = 5 * 2;                                  // 10 m patches
const GRASS_WIDTH = 0.1;       const GRASS_HEIGHT = 1.5;
```
- **Patch placement.** Every frame the camera position is snapped to the 10 m grid, and a 32×32 window of candidate patches is visited. Each patch's AABB is first tested against distance (it must be within 100 m), then against the frustum.
- **Patch drawing.** Each surviving patch takes a mesh from a pool: the high LOD if it is within 15 m, otherwise the low LOD. That gives one draw call per visible patch.
- **Per-blade variation.** Everything per blade is derived in the vertex shader from `hash42(worldPos.xz)`: angle, height (×0.75–1.5) and lean.
- **Wind.** Direction is `noise12(pos.xz*0.05 + 0.05*time)`, gust strength is `noise12(pos.xz*0.25 + time)`, the lean is eased (`easeIn(x,2)*1.25`) and multiplied by height%, and there is idle sway `noise12(time*0.35 + pos*137.4)*0.1`.
- **View-space thickening:** `mvPosition.x += easeOut(1-viewDotNormal,4)*smoothstep(0,0.2,viewDotNormal)*(xSide-0.5)*width*0.5*zSide`.
- **LOD blend:** `smoothstep(lodDist*0.5, lodDist, dist)` morphs the width profile from `easeOut(1-h,2)` to `1-h`.
- **Fragment shading.** The shader uses wrapped diffuse `(N·L + w)/(1 + w)` and a backlight term with the same wrap on `dot(V,-L)` (added to indirect). AO by height is `mix(mix(1,0.25,density), 1, easeIn(h,2))`. The normal is blended toward up by distance.

**Bruno Simon folio-2025** (three.js WebGPU/TSL, MIT): [repo](https://github.com/brunosimon/folio-2025). I read it directly.
- **Grass geometry.** `World/Grass.js` builds a single mesh of **280×280 = 78,400 blades**, each **one triangle (3 vertices)**, jittered inside its grid cell.
- **Following the camera.** The patch follows the camera by toroidal wrap in the vertex shader: `mod(pos + half, size) - half`. No CPU per-blade work is done and no geometry is rebuilt.
- **Facing, wind and masking.** Each blade is yawed to face the camera. Wind is `wind.offsetNode(worldPos.xz) * tipness * height * 2`. The terrain data texture's G channel is the grass mask; masked-out blades are lifted 100 m away to hide them.
- **Colour and lighting.** Colour comes from the terrain colour node, so blades and ground match. Normals are all forced to up, so the blades light like the ground.
- **Global wind.** `Wind.js` is one global field: `direction = (sin a, cos a)`, `strength` comes from the weather, and two Perlin-texture samples are scrolled along the direction with `localTime`. `localTime` advances by `dt * timeFrequency * strength`, so stronger wind also moves faster. Every material calls `offsetNode(pos.xz)`.
- **Foliage.** `Foliage.js` uses 80 alpha-tested `0.8×0.8` cards per bush. The normals are lerped 85 % toward the radial direction ("spherized"), and shading is two-tone on `N·L`. Leaves are kept out of the shadow lookup by offsetting the received-shadow position along L.
- **Flowers.** `Flowers.js` places 3–10 flowers per cluster in a 3×3 m square. Each flower is 8 tiny quads arranged in a dome, and wind is applied ∝ local y.

**windcrest** (three.js, one instanced draw): [repo](https://github.com/kloserock97-tech/windcrest). I read it directly.
- **Count and cost.** It draws **about 380k blades** at **7 vertices** each, with a 3-vertex far LOD, and runs at **165 Hz on an Intel Arc *integrated* GPU at 1368×775 with MSAA**. At 600k blades it runs at about 130 fps. A 3-vertex blade costs less than half as much as a 7-vertex one.
- **Wind** uses two value-noise layers scrolled downwind and thresholded into gust patches, plus a weak travelling wave. The noise uses an **integer hash**, because a sin-hash bands at world coordinates.
```glsl
float n = vnoise(p*0.16*uGustScale - scroll*0.42)*0.62 + vnoise(p*0.52*uGustScale - scroll*1.1)*0.38;
float wave = sin(dot(p, uWindDir)*0.85 - uTime*1.55)*0.5 + 0.5;
float g = smoothstep(0.28, 0.82, n)*0.8 + wave*0.2;  return g*g;
```
- **Length-preserving bend.** The bend lowers the tip instead of stretching the blade:
```glsl
float tl = length(tip); if (tl > 0.94) tip *= 0.94/tl;
float lift = sqrt(max(0.0, 1.0 - dot(tip, tip)));
vec3 world = aOffset + widthDir*position.x*width + up*(t*len*lift) + vec3(tip.x,0,tip.y)*len*bend; // bend ∝ t²
```
- **Rounded normal:** `N = normalize(N + widthDir*(position.x*2.0)*0.6)`.
- **Anti-shimmer.** Blades get a minimum pixel width, `width = max(width, dist*uPixelWorld*uMinPixels)`, and are widened with distance and when seen edge-on. Edges use alpha-to-coverage with `fwidth` (MSAA only).
- **Translucency:** `pow(max(dot(-V,L),0),6) * smoothstep(0.35,0.75,t) * (1-0.55*smoothstep(0.8,1,t))`.
- **Distance normal blend:** `N = normalize(mix(N, slopeNormal, smoothstep(5,15,dist)*0.75))`, which removes per-pixel flicker.
- Lighting is done **per vertex**, because fragment cost multiplies with layered overdraw. Flattened blades show their paler underside.

**Other data points.**
- A three.js forum post reports **1.5M instanced blades, 0.2 ms CPU and 3 ms GPU on an RTX 2060** ([thread](https://discourse.threejs.org/t/interactive-grass-with-multi-player-physics-and-wind-fps-friendly-and-suitable-for-games/87994)).
- Another reports over 1M blades merged into one *non-instanced* geometry at 60 fps on an M1 ([thread](https://discourse.threejs.org/t/real-time-grass-simulation-in-the-browser-over-1-million-blades-at-60-fps/82808)).
- A forum rule of thumb puts the total triangle sweet spot at about 3M, and says a 20-tri blade "would be 20× over budget" ([thread](https://discourse.threejs.org/t/whats-the-most-performant-way-to-make-grass/39774)).
- keaukraine's WebGL "Spring Flowers" demo and Android wallpaper split grass, flowers and tall grass into CPU-culled tiles, with transforms in an FP32 texture. Tiles are padded by one model size so edge instances don't pop ([article](https://keaukraine.medium.com/efficient-webgl-vegetation-rendering-b09a7fa904cc)). On low-end phones the vertex shader was the bottleneck, and the fix was lower density and no wind.
- Cinevva's browser open-world series found that **batching instances into fewer meshes mattered more than per-blade polygon count**. Their shadows used 3 cascades at 1024 px within a 2 ms budget on target hardware ([part 5](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-05-budgeting-the-pretty), [occlusion](https://app.cinevva.com/blog/2026-05-19-terrain-occlusion-culling)).

### 1.2 Blade construction checklist (consensus of the above)
1. **Geometry.** Use a triangle strip of 3 / 5–7 / 11–15 vertices (far, mid, near) with a tapered width profile. Generate everything in the vertex shader from `gl_VertexID` (or a per-vertex index attribute) plus a per-blade hash. Do not store per-blade attributes if a hash of the world position will do.
2. **Shape.** Use a curve (Bézier, or `rotateX(lean·h^k)`) with a length-preserving bend (sqrt lift). The tip offset grows ∝ t² so the root stays planted.
3. **Rounded normals:** tilt the normal toward ±width direction at the edges (about 0.6 × side). Blend the normal toward the terrain normal beyond about 5–15 m.
4. **Edge-on thickening** in view space. This prevents the blades vanishing into lines.
5. **Minimum on-screen width** of about 1 px: `max(width, dist*pxWorld*1.0)`. Widen the remaining blades when you thin them, to keep coverage.
6. **Lighting.** Use wrapped diffuse. Translucency should come only from the sun behind and only on the upper blade: `pow(sat(dot(-V,L)),4..8)·smoothstep(.35,.75,t)`. Add AO by height (dark roots: 0.25–0.5 at the root rising to 1 at the tip, stronger where density is high). Use a root→tip colour gradient, lerped between two palettes by the clump hue (the "BotW" two-tone look; see [cinevva part 28](https://app.cinevva.com/blog/2026-05-14-open-world-browser-part-28-grass-and-occlusion)). Add a weak specular sheen on the blade facing the sun. When the wind presses blades flat, show their pale underside.
7. **Per-vertex vs per-fragment.** Do lighting per vertex when the vertex count is lower than the covered fragments × overdraw (windcrest's argument). For close blades, per-fragment is fine.
8. **Clumps:** use jittered-grid Voronoi cells, about 0.5–2 m. Blades take their cell's height, tone and lean (pointing toward or away from the clump centre). This is what turns a carpet into a meadow.

### 1.3 Placement, LOD rings, culling without compute (WebGL2)
- **Camera-snapped tiles** (SimonDev). Use a grid of 8–10 m tiles around the camera. The CPU tests about 200–1000 tile AABBs against distance and the frustum. That is cheap: microseconds, with no allocation if the arrays are reused. To get one draw call per LOD instead of one per tile, make each **instance a tile**: instance attribute = tile origin + LOD/fade, and the blades inside come from `gl_VertexID` plus a hash of (tileCoord, bladeIndex). Visible tiles are written into a preallocated `InstancedBufferAttribute` each frame and `mesh.count` is set. This is deterministic, so recycled tiles never re-randomize.
- **Toroidal wrap** (Bruno). One static mesh's blades are wrapped modulo the patch size around the camera. It costs zero CPU but has no frustum culling, so it suits a small radius only.
- **Density masks.** Bake a "grass map" texture once at boot from the plan: lawn, meadow, verge or kerb-weeds, plus species, height and mowing. Blades where the mask is 0 are collapsed to a degenerate point. They still cost vertex work but no raster work, so also precompute **per-tile coverage** and skip empty tiles on the CPU.
- **Crossfade without popping.**
  - Per blade, fade out where `dist > lodEnd*(0.7 + 0.3*hash)`, by shrinking height and width to 0, not by alpha.
  - When the far ring keeps 1/4 of the blades, the survivors widen ×2 so coverage is constant (GoT).
  - Morph the near blade's vertex layout onto the far blade's before switching (GoT, Quick_Grass width-profile blend).
- **Culling options in WebGL2 without compute:**
  1. CPU tile culling (the standard choice).
  2. In-shader early-out: put the vertex outside the clip volume or collapse it. This saves raster only.
  3. Transform-feedback compaction: render one point per instance, cull it, and write survivors to a VBO ([Khronos thread](https://community.khronos.org/t/instance-shader/73587)). This is awkward without geometry shaders and seldom worth it at our scale.
  4. three.js `BatchedMesh` / InstancedMesh2 per-instance culling ([forum](https://discourse.threejs.org/t/ideas-on-performing-fast-per-instance-frustum-culling-on-instancedmesh/85156)). That is overkill for grass.

### 1.4 The far field: a ground shader that reads as grass
At 150–600 m nothing but shading is visible (section 0). Proven tricks:
- **Same palette as the blades.** The ground albedo equals the *average blade colour seen from above*, roughly a 60/40 mix of mid-blade and tip colour, not soil. Far tiles blend toward the tip colour so the culled distance keeps the foreground's density (GoT secondary sources; the GodotGrass port also pulls distant fragments toward an average colour).
- **Clump and species patchwork** in 2–3 octaves of noise (2 m, 10 m and 40 m features): hue ±5 %, value ±10 %. Add seasonal dry patches on slopes facing south (+X/+Z sun side), and darker lush strips along water, walls and shade.
- **Moving wind sheen.** Sample *the same* wind field and brighten or desaturate where gusts press the grass. Travelling light bands across a far meadow are the cheapest "alive" cue there is, and they stay consistent with the near blades.
- **View and sun response.** Grass fields look brighter and more yellow-green when looking toward the sun (translucency) and darker and bluer looking away. Add a `pow(sat(dot(-V,L)),4)` warm lift, and a slight darkening at grazing view angles from self-occlusion.
- **Wildflower speckle.** Put one dot per cell (cell size about 0.3–1 m), with probability from the species patch noise. Fade the dots to the cell-average colour by `fwidth(uv)`. That is mandatory, or they sparkle.
- **Shells or parallax** for mid distance (optional). Shell texturing renders N offset copies of the ground with an alpha-tested noise ([Godot shell grass](https://godotshaders.com/shader/fur-grass-with-shell-texturing/)). It looks great from above, which suits a high camera. However, the cost is linear in layers × covered pixels, and **discard on Adreno defeats early-Z/LRZ** (see 1.6). A single-pass "parallax grass" alternative ray-marches 4–8 steps in a heightfield noise inside the ground shader: no overdraw, fixed cost per pixel. Fade it out by distance and grazing angle; both techniques break at grazing angles.
- **Anti-repetition** for any canvas-generated texture: hex-tiling, 3 taps with a smooth blend ([Mikkelsen JCGT 2022](https://jcgt.org/published/0011/03/05/paper.pdf)).

### 1.5 Wildflowers: distribution recipe
- **One noise density field per species** (fBm, 15–60 m features), thresholded with a soft edge. Species occupy different niches: white or yellow dominant in the open; poppies at field and road edges; purple and blue in damp low ground near the river; dandelions in mown lawns ([CropCraft](https://arxiv.org/pdf/2511.02417), [scatter rules](https://www.strayspark.studio/blog/building-believable-biomes-procedural-scatter)).
- **Clusters inside patches:** dense centres with a falloff, using Poisson or jittered-grid spacing instead of pure random, which gives "overpacked and empty" areas ([gamedev.net](https://gamedev.net/blogs/entry/2270025-poisson-disk-sampling-for-random-entities-placement/)).
- **Make flowers part of the grass instancing.** A per-blade hash below the species density turns that blade into a flower: a stem plus a 4–8 tri head (a disc or star, a dome of tiny quads as in Bruno's flowers). There is no extra draw call, and the same wind applies.
- **Typical meadow numbers** (reference image): 5–15 % of near "blades" are flowers in flowering patches and about 0 % elsewhere. Heads are 2–5 cm, so they must be ≥ 1 px, which means within about 50 m.

### 1.6 Costs and integrated-GPU specifics
- **Vertex throughput is the limit** (windcrest, keaukraine, Cinevva). Rough scaling from windcrest: 2.66M grass vertices fit a 6 ms frame on an Intel Arc iGPU (about 4+ TFLOPS). The X1-45 is about 2–2.5× slower, so **budget ≤ 0.5M grass vertices for about 1.5–2 ms**. This is my extrapolation, so measure with `perf.mjs`.
- A ring budget that fits that, for a 30 % lawn fraction:
  - 0–15 m: about 700 m² × 0.3 × 150 blades/m² ≈ 32k blades × 11 verts ≈ 0.35M.
  - 15–50 m: about 7,100 m² × 0.3 × 30/m² ≈ 64k × 3 verts ≈ 0.19M.
  - Beyond 50 m: shader only.
  - At the overview the grass system is nearly idle.
- **Adreno (tile-based):** Prefer **opaque geometric blades** (no `discard`) over alpha-tested cards. Discard disables early-Z and limits LRZ ([Igalia LRZ](https://blogs.igalia.com/siglesias/2021/04/19/low-resolution-z-buffer-support-on-turnip/), [Mesa LRZ](https://docs.mesa3d.org/drivers/freedreno/hw/lrz.html)). Alpha-blended grass is a no-go; a Quest developer reports that alpha-tested grass with ZWrite is OK ([Unity forum](https://discussions.unity.com/t/any-clever-trick-for-tall-grass-on-mobile-quest/811738)). Alpha-to-coverage needs MSAA, which this pipeline doesn't render with.
- **Shadows.** Do **not** draw grass into the shadow map (GodotGrass calls it "very high performance cost"). Fake root darkening with AO by height, and let blades *receive* shadows from the sun's map only in the near ring, if at all.
- **Pitfalls:**
  - Sub-pixel shimmer: use the min-width floor plus the normal-to-terrain blend.
  - Sin-hash banding at large world coordinates: use an integer hash (windcrest).
  - Popping at tile and LOD edges: per-blade hash thresholds and padding.
  - Grass poking through roads and paths: the occupancy-derived mask, plus a margin.
  - N8AO halos: blades in the depth buffer get AO, so check that the meadow doesn't turn grey.
  - Visible tiling of the hash.

---

## 2. Atmosphere and aerial perspective

### 2.1 Analytic fog (Inigo Quilez, [article](https://iquilezles.org/articles/fog/); formulas *(from memory, widely reproduced)*)
```glsl
// 1) exponential fog with sun-dependent colour (warm toward the sun)
float fogAmount = 1.0 - exp(-t * b);
float sunAmount = max(dot(rd, sunDir), 0.0);
vec3  fogColor  = mix(vec3(0.5,0.6,0.7), vec3(1.0,0.9,0.7), pow(sunAmount, 8.0));
col = mix(col, fogColor, fogAmount);
// 2) separate extinction and in-scattering, per channel (blue scatters more → distant things go blue, then white)
vec3 ext = exp(-t * be);            // be, bi: vec3 coefficients
vec3 ins = exp(-t * bi);
col = col * ext + fogColor * (1.0 - ins);
// 3) exponential height fog, density(y) = a·exp(-b·y), integrated along the ray from ro
float fogAmount = (a/b) * exp(-ro.y*b) * (1.0 - exp(-t*rd.y*b)) / rd.y;
```
**Pitfall:** `rd.y → 0` divides by zero ([MonoGame thread](https://community.monogame.net/t/solved-height-distance-based-fog-again/14371)). Use the limit `a·t·exp(-b·ro.y)` when `|t·rd.y·b| < 1e-3`. The function returns optical depth, so feed it through `1 - exp(-x)`. See also [demofox, analytic fog density](https://blog.demofox.org/2014/06/22/analytic-fog-density/).

### 2.2 UE-style exponential height fog with directional in-scattering
The [UE docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/exponential-height-fog-in-unreal-engine) give the knobs: Fog Density, Height Falloff, Inscattering Colour, Directional Inscattering Exponent, Start Distance and Colour. The maths is a self-consistent derivation of what the engine does *(engine source not checked)*:
```glsl
float rho0 = density * exp(-falloff * (camY - fogHeight));          // density at the camera
float dz   = falloff * (P.y - camY);                                 // vertical delta of the ray, scaled
float shape = abs(dz) > 1e-3 ? (1.0 - exp(-dz)) / dz : 1.0 - 0.5*dz;
float od   = rho0 * shape * rayLen;                                  // optical depth along the ray
float T    = exp(-od);                                               // transmittance
vec3  dirIn = sunCol * pow(saturate(dot(V, L)), dirExponent);        // sun glow lobe (exp 8–32)
float Td   = exp(-rho0 * shape * max(rayLen - dirStart, 0.0));
col = col * T + inscatterCol * (1.0 - T) + dirIn * (1.0 - Td);
```
The **directional term** is what makes golden-hour haze glow toward the sun while staying blue-grey away from it. It is the biggest single "breathtaking" cue in the reference. **Start distance** keeps the foreground crisp.

### 2.3 Physically plausible numbers (use them as a sanity scale)
- **Koschmieder.** Visibility `V = 3.912/β` ([calculator](https://codingace.net/physics/visibility_koschmieder.html)). Clear air with V = 50 km gives β ≈ 8e-5/m. Golden-hour haze with V = 10–15 km gives β ≈ 2.6–4e-4/m. Hazy summer evening with V = 5 km gives β ≈ 8e-4/m.
- With β = 3e-4/m:
  - Across the 600 m city: 1 − e^(−0.18) ≈ **16 % haze**.
  - Mountains at 3 km: **59 %**.
  - Mountains at 6 km: **83 %**.

  That is exactly the "layered ridges fading to sky" look, without exaggerating the city.
- **Rayleigh at sea level** ≈ (5.8, 13.5, 33.1)·1e-6/m. That is negligible over 600 m, but gives the per-channel ratio for `bi`: distant layers go blue.
- **Scale heights.** Aerosols live in a boundary layer of about 1–2 km. For a *valley or river mist* layer, use a separate height fog with an exponential scale of about 10–30 m, densest near water and at dawn and dusk.
- In practice the city keeps contrast while the ridges fade. This is the real-world cue that is missing today: the critique says fog starts at about 800 m.

### 2.4 LUT-based physical sky and aerial perspective
- **Hillaire 2020**, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique" ([paper](https://diglib.eg.org/handle/10.1111/cgf14050), [slides](https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf), [code](https://github.com/sebh/UnrealEngineSkyAtmosphere)). It uses a transmittance LUT (256×64), a multi-scattering LUT (32×32), a sky-view LUT (192×108) and an aerial-perspective froxel volume (32×32×32) *(sizes from memory)*.
  - A Vulkan reimplementation measured each LUT pass in **tens of µs** ([thesis](https://cescg.org/wp-content/uploads/2023/04/Sakmary-Real-time-Rendering-of-Atmosphere-and-Clouds-in-Vulkan.pdf)).
  - In WebGL2 the 3D froxel volume would have to be rendered slice by slice. A FlightGear port used a tiled 2D texture instead for that reason.
  - There is a WebGPU port: [webgpu-sky-atmosphere](https://github.com/JolifantoBambla/webgpu-sky-atmosphere).
- **[@takram/three-atmosphere](https://unpkg.com/@takram/three-atmosphere@0.13.2/README.md)** implements Bruneton's model as a pmndrs `postprocessing` AerialPerspective effect. It is a new dependency (not allowed), but it is a good reference for how to apply aerial perspective as a post effect on the depth buffer.
- **Verdict for Tinyhaven:** analytic (2.1/2.2) per-channel height fog with a sun lobe plus the existing sky gets 90 % of the look for about 0 ms when it is in the fog chunk. LUTs only pay off with a dynamic planet-scale camera.

### 2.5 Fog colour that matches the sky (no seams at the horizon)
- **Firewatch** (Jane Ng, GDC 2015) coloured fog with an artist **gradient ramp indexed by distance**, which gives stylised layered colour bands ([Unity recreation](https://hyphinett.itch.io/gradient-fog-for-unity), [Godot](https://godotshaders.com/shader/distance-gradient-fog-4-3/)).
- **Valve cubemap fog** samples fog colour from a *blurred sky cubemap* by view direction, using lower mips nearby ([Valve wiki](https://developer.valvesoftware.com/wiki/Env_cubemap_fog)). The in-scattered colour then *is* the sky colour in that direction, so silhouettes melt into the horizon.
- **Cheapest equivalent here:** evaluate the sky shader's horizon or below-horizon function (or a 64×16 equirect "fog LUT" rendered from it once per sky change) in the fog chunk. The forum advice for three.js is to replace `THREE.ShaderChunk.fog_fragment` / `fog_pars_*` *before* any material compiles, so every built-in and onBeforeCompile material inherits it ([forum](https://discourse.threejs.org/t/matching-fog-color-with-the-sky-shader/52018)). Custom ShaderMaterials must include the fog chunks.
- **Alternative:** a post pass that reconstructs world position from depth (needed anyway for height fog in post; [forum](https://discourse.threejs.org/t/reconstruct-world-position-in-screen-space-from-depth-buffer/5532)). It is one place for all opaque geometry, but transparents (water, smoke, glass) need in-material fog anyway, so the chunk route is simpler.

### 2.6 Distance desaturation and contrast loss
Aerial perspective is not just "add fog colour". Real distance also lowers **contrast** (shadows lift toward the fog colour faster than highlights drop) and **saturation**, and shifts hue toward the sky's. Two approaches work:
- Apply part of the fog as a desaturation, `mix(col, vec3(luma(col)), k·fogAmount)` with k ≈ 0.3–0.5, before the colour blend.
- Use the per-channel `bi` (2.1) so that reds drop first.

Both are free in the fog chunk.

### 2.7 Distant terrain layers (mountains and forest) beyond the city
- **Geometry:**
  - 2–4 **ring meshes** at about 1.5–3 km, 3–5 km and 6–9 km (raise the camera far plane from 6000 or keep the last ring below it).
  - Each ring is about 256–512 segments around × 8–16 rows: 4–8k vertices per ring, 1 draw call each, no shadows.
  - Silhouettes come from **ridged multifractal** noise: `r = 1-|n|; r *= r; sum += r·amp·w; w = sat(r·gain)`. Tall, sharp far layers; rounded, forested near layers.
  - Add a few hero peaks placed where the overview camera frames them.
- **Shading per layer:**
  - The near layer gets a dark conifer texture via noise (tree-crown speckle, as in 1.4), a treeline by altitude, and rock on steep slopes.
  - The far layer gets snow above an altitude with noise, and rock.
  - All get fog (2.2) **per vertex**: the geometry is coarse and far, so per-vertex fog is accurate enough and nearly free.
- **Why it works:** overlapping silhouettes at different haze levels (value and saturation stepping toward the sky colour) give the four depth layers of the reference: meadow → village → forest → mountains. Parallax comes for free from real 3D placement; no screen-space trickery is needed.
- **Mid-distance forest** between the city and the mountains:
  - Instanced low-poly cones and blobs (≤ 50–100 tris), or
  - **Octahedral or ring impostors** baked *at boot* from the procedural tree generators (render-to-texture, so still "procedural"). Use a 16×16 view grid ([Meep engine](https://discourse.threejs.org/t/meep-a-game-engine/10098/13)) or 24 horizontal views + 1 top view ([Cinevva part 19](https://app.cinevva.com/blog/2026-05-04-open-world-browser-part-19-imposters)). A three.js showcase draws 200k trees with an impostor beyond 100 units ([forum](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735), [three.js impostors](https://discourse.threejs.org/t/octahedral-impostors-for-three-js/80318)).
  - Blend the 3 nearest views ([Zucconi](https://www.alanzucconi.com/?p=9941)). Pitfalls: seams from interpolation lines, and alpha-test discard cost.
- References: [Godot mountain background shader](https://godotshaders.com/shader/mountain-background-shader/) (vertex displacement + haze by distance), [Hoffman/Preetham aerial perspective](https://research.cs.wisc.edu/graphics/Courses/779-s2003/final_projects/dwleonar/Cg%20Aerial%20Perspective%20with%20Procedural%20Terrain.htm).

### 2.8 God rays / light shafts
- **GPU Gems 3 ch. 13** (Kenny Mitchell, [chapter](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process)) does a radial blur toward the sun of an occlusion mask (sky = bright, geometry = black):
```glsl
vec2 dUV = (uv - sunUV) * (1.0/float(N)) * density; float decay = 1.0; vec3 c = vec3(0);
for (int i = 0; i < N; i++) { uv -= dUV; c += texture(mask, uv).rgb * decay * weight; decay *= decayK; }
c *= exposure;
```
- **pmndrs `GodRaysEffect`** defaults to 60 samples, density 0.96, decay 0.9, plus an optional blur ([docs](https://react-postprocessing.docs.pmnd.rs/effects/god-rays)).
- **Cost control:**
  - Build the mask from **depth == far** (sky) × sun-disc and halo glow, at **¼ resolution**. At 480×256 that is 123k px; × 32 samples ≈ 4M taps, roughly 0.1–0.2 ms on an integrated GPU (estimate).
  - Jitter the start offset per pixel (blue noise or IGN) to hide banding with few samples.
  - Fade the effect by sun-on-screen distance and sun elevation, so it only appears at golden hour when the sun is near the frame. Unity's SunShafts use the same structure: chosen resolution, blur iterations and an optional sky alpha mask ([docs](https://docs.unity3d.com/550/Documentation/Manual/script-SunShafts.html)).
- **Cheaper alternative with no extra pass:** the directional in-scatter lobe in fog (2.2) already gives the sun glow. Shafts add the striping where trees or towers occlude it. Do them only if the sun is in frame in the hero views. With the overview camera looking NNW, the golden-hour sun is behind or beside the camera, so check before paying for it.

---

## 3. Wind as one global system

### 3.1 Precedents
- **Ghost of Tsushima** used one cheap 2D Perlin field scrolling with a global wind vector. Grass, trees, cloth, banners and hundreds of thousands of GPU leaf particles all read it ([GDC "Blowing from the West"](https://gdcvault.com/play/1027124/Blowing-from-the-West-Simulating), [Game Developer article](https://gamedeveloper.com/design/using-vorticles-to-simulate-wind-in-i-ghost-of-tsushima-i-)). Local "vorticles" were added for gusts around the player. Rockenbeck prioritised volume over accuracy.
- **Bruno Simon `Wind.js`** (read directly): `direction`, `strength`, `positionFrequency` and `localTime` are shared uniforms plus one `offsetNode(posXZ)` function. Every material (grass, flowers, foliage cards) calls it, and time runs ∝ strength.
- **UE "Komodo" wind** synchronises trees, grass, cards and Nanite through one Material Parameter Collection with scrolling noise "inspired by Ghost of Tsushima" ([forum](https://forums.unrealengine.com/t/2422334)).

### 3.2 Recommended shape (adapt to `ctx.uniforms.uWind`)
```glsl
// shared chunk: thWind.glsl — identical maths mirrored in TS (core/wind.ts) for particles, flags, audio
uniform vec2 uWindDir; uniform float uWindStrength; uniform float uWindTime;  // uWindTime += dt * (0.3 + strength)
float thGust(vec2 p) {                       // 0..1, travelling gust patches, ~80 m and ~20 m features
  vec2 s = uWindDir * uWindTime;
  float n = vnoise(p*0.0125 - s*0.0125)*0.62 + vnoise(p*0.05 - s*0.035)*0.38;   // integer-hash value noise
  float w = 0.5 + 0.5*sin(dot(p, uWindDir)*0.08 - uWindTime*1.3);              // long swell underneath
  float g = smoothstep(0.30, 0.80, n)*0.8 + 0.2*w;  return g*g;
}
vec2 thWindAt(vec2 p) { return uWindDir * uWindStrength * (0.25 + 0.75*thGust(p)); }
```
- A **CPU mirror** is essential: smoke puffs, flags, birds, leaves, boat sails and audio (wind loudness and gust whooshes) should all follow the *same* gust passing through. A gust visibly rolling across the meadow, then the trees, then bending the smoke, then flapping the flags, in that order, is the "living" signature.
- **Texture variant:** bake a 128² tileable noise once (canvas or DataTexture) and sample it twice with scrolling UVs. That is 2 vertex-texture fetches per vertex, which is cheaper than ALU value noise × 2 octaves per grass vertex. It also matches the GoT and Bruno approach.

### 3.3 Trees: main bending + detail bending (Crysis, GPU Gems 3 ch. 16, [chapter](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis); code *(from memory)*)
```glsl
// main bending: whole tree leans with the wind, length preserved
float bf = pos.y * bendScale; bf += 1.0; bf *= bf; bf = bf*bf - bf;     // smooth, stiff near the root
vec3 np = pos; np.xz += wind.xz * bf;  pos = normalize(np) * length(pos);
// detail bending: branches bob + leaf edges flutter; phases decorrelate instances, branches, vertices
float objPhase = dot(instanceWorldPos, vec3(1.0));
float brPhase  = vBranchPhase + objPhase;                                 // per-branch phase (vertex colour G)
float vtxPhase = dot(pos, vec3(detailPhase + brPhase));
vec2 wavesIn = time + vec2(vtxPhase, brPhase);
vec4 waves = fract(wavesIn.xxyy * vec4(1.975, 0.793, 0.375, 0.193)) * 2.0 - 1.0;
waves = smoothTriangleWave(waves * speed * detailFreq);  // SmoothCurve(TriangleWave(x)), TriangleWave = abs(fract(x+.5)*2-1)
vec2 ws = waves.xz + waves.yw;
pos.xz += ws.x * edgeAtten * detailAmp * normal.xz;   // leaf-edge flutter along the leaf normal (Crysis is z-up: vNormal.xy)
pos.y  += ws.y * branchAtten * branchAmp;              // branch bob (up axis)
```
- Vertex colours in Crysis: R = leaf-edge stiffness, G = per-branch phase, B = branch stiffness, A = baked AO *(from memory)*. Wind per instance = the sum of wind sources, computed on the CPU. For instancing, sample `thWindAt(instanceRoot.xz)` in the shader instead, so neighbouring trees bend in sequence as a gust passes.
- **Book of the Dead** (Unity): hierarchy pivots (trunk → A branches → B branches, each with range and elasticity), a single pivot for grass and bushes, and a procedural fallback ([Unity blog](https://unity.com/en/blog/industry/book-of-the-dead-quixel-wind-scene-building-and-content-optimization-tricks)). A procedural generator *knows* the pivots, so it can write them into attributes at no cost.
- **Foliage cards vs blobs.** The critique says the trees read as "faceted green polyhedra". Proven fixes:
  - Alpha-cut leaf-cluster cards (Bruno: 80 cards per bush) with normals **spherized toward the crown centre** (85 % lerp), two-tone `N·L`, and a received-shadow offset along L ([Bruno Foliage.js](https://github.com/brunosimon/folio-2025)). The Polycount and UE practice is the same: transfer normals from a dome or hull proxy ([polycount](https://polycount.com/discussion/comment/2717502/)).
  - Cost: discard plus overdraw (1.6). Keep cards few and large, opaque crown core plus a cutout fringe only.

### 3.4 Flags, bunting, prayer-flag lines, laundry
- **Line:** a catenary `y = a·cosh(x/a) − a` between two anchors, sagging 3–8 % of the span. The line itself sways laterally by `thWindAt(mid)·k`, with phase along the span.
- **Each flag is an instanced quad** (2×4 segments) hinged on the line: rotation about the line axis = `atan(windPerp·k)` plus noise, so it is lifted by wind. A travelling wave across the flag width has amplitude growing toward the free edge: `offset = A·u·sin(k·u − ω t + phase)` ([Godot flag shader](https://godotshaders.com/shader/3d-simple-animated-flag-shader/)). Frequency ∝ wind speed.
- **Colours:** the 5-colour prayer-flag palette (blue, white, red, green, yellow) repeats. Sun translucency on thin cloth uses the same lobe as grass. One draw call for all lines.

### 3.5 Smoke and water use the same field
- **Smoke:** advect puffs with the CPU mirror plus vertical shear (wind speed grows with height: `w(h) = w0·(h/10)^0.14` for open terrain *(standard power-law profile)*). The plume then bends over more as it rises.
- **Water:** gusts darken and roughen the surface in moving patches ("cat's paws"). Modulate the ripple normal strength and roughness by `thGust(p)` and add a slight scroll along the wind. This is the water equivalent of the meadow sheen.

---

## 4. Smoke and soft particles

- **Soft particles:** fade = `saturate((sceneLinearDepth − particleLinearDepth) / softRange)`, with a softRange of about 0.5–2 m. NVIDIA's contrast curve is smoother than a linear ramp *(from memory)*: `o = 0.5·pow(sat(2·(x>0.5?1−x:x)), P); o = x>0.5 ? 1−o : o` with P ≈ 2. It needs a linearised depth texture, which the postfx pipeline already has for N8AO and DOF ([keaukraine soft particles](https://keaukraine.medium.com/implementing-soft-particles-in-webgl-and-opengl-es-b968d61133b0), [three.js forum](https://discourse.threejs.org/t/soft-particles-render/504)). Also fade near the camera near plane.
- **Lighting smoke from the sun:**
  - **Spherical or bent normals** per billboard (UE "Generate Spherical Particle Normals"). Alternatively, light only the 4 corners with normals bent away from the centre and interpolate: the Company of Heroes trick, also used in Bioshock and SotC ([breakdown](https://simonschreibt.de/gat/company-of-heroes-shaded-smoke)).
  - **Forward scattering** gives the backlit glow: Henyey–Greenstein `p(θ) = (1−g²) / (4π(1 + g² − 2g cosθ)^1.5)` with g ≈ 0.6–0.8 forward, mixed with a weak back lobe (g ≈ −0.2) ([HG reference](https://mitsuba.readthedocs.io/en/latest/src/generated/plugins_phase.html)). Weight it by (1 − density) so thin edges glow and dense cores stay grey: the "silver lining".
  - **Ambient** from the sky colour on top and from the ground or city glow underneath. At golden hour, set the shadowed side to the blue sky colour and the lit side to warm.
  - **Six-way baked lightmaps** look best but need offline bakes ([realtimevfx](https://realtimevfx.com/t/solved-6-way-lightmap-smoke-in-unreal/13844)).
- **Procedural textures:** a canvas-generated **flipbook atlas**, for example 8×8 frames of 64² tiles of fbm with domain warp and an evolving seed, alpha eroded by `smoothstep(t, t+0.2, density)` as the puff ages. Alternatively evaluate fbm in-shader per puff (ALU heavy on large puffs). Curl-noise turbulence for motion: [The Spirit](https://experiments.withgoogle.com/the-spirit). Erosion over life reads far better than a plain alpha fade.
- **Off-screen low-res particles** (GPU Gems 3 ch. 23, Cantlay, [chapter](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles)): render particles into a ½ or ¼ target with a downsampled depth, then upsample and composite. Smoke is low-frequency, so quality loss is minimal and overdraw cost drops 4–16×. Cost: an extra target and an edge fix-up (the chapter discards or refines at depth edges). Worth it only if smoke overdraw becomes measurable.
- **Chimney behaviour that sells "real":**
  - Puffs leave with a small upward velocity plus buoyancy decaying over about 3–6 s, grow ×3–5, and get sheared by wind (3.5).
  - Rate varies slowly per chimney (some cold, one or two smoking well).
  - Wood smoke is pale blue-grey and thin; coal or industrial smoke is darker and denser.
  - Smoke is most visible backlit at golden hour and in cool still evenings. Consider "inversion" evenings where smoke flattens into a thin layer at 30–60 m: the same height-fog layer as the valley mist.
- **Pitfalls:** overdraw from large near puffs (cap screen size, fade near the camera), sort popping (the current insertion sort is fine), banding in thin alpha (dither), and soft-particle depth precision far away (use linear depth).

---

## 5. Weathering, grime and imperfection without textures

**Mask sources that procedural geometry gets for free:**
1. World normal (`n.y` up, `dot(n, north)`).
2. Height above ground (`worldY − terrain.height`).
3. Generator knowledge: window sill positions, roof edges, wall bases, corners, distance to the nearest edge written as a vertex attribute.
4. Baked vertex AO, or the screen-space N8AO term.
5. Screen-space curvature, `length(fwidth(N))` or Unigine-style SSDirt ([docs](https://developer.unigine.com/ru/docs/latest/editor2/settings/render_settings/ssdirt/?rlang=cpp), [curvature node](https://developer.unigine.com/docs/latest/content/materials/graph/node_library/misc/curvature)).
6. World-space noise. Use an integer hash and fade octaves by `fwidth` to avoid sparkle.

| effect | mask | look |
|---|---|---|
| Rising damp / splash band | `1 − smoothstep(0, 0.6–1.2 m, heightAboveGround)` × noise | darker and slightly greener at wall bases, efflorescence (pale) on the upper edge |
| Streaks under sills, cornices, balconies | vertical anisotropic noise `n(x·8, y·0.5)` × `smoothstep(sillY, sillY − 0.8…2 m)`, limited to the sill's x-range (generator knows it) | dark grey-brown streaks, widest at the top |
| Roof-edge drips | same, below eaves, plus gutter downpipe stains | |
| Moss and algae | `smoothstep(0.3, 0.8, dot(n, north)) + up-facing low slopes`, × shadow/AO × noise; densest near the ground and on roofs facing north. Valve's Black Mesa moss uses angle + falloff params ([wiki](https://developer.valvesoftware.com/wiki/Moss)); up-mask = `pow(remap(dot(N, up)), k)` ([polycount](https://polycount.com/discussion/comment/2102170/)) | desaturated olive, rougher |
| Cavity grime | AO (vertex or N8AO) → darken albedo in cavities more than lighting alone | "used" look in corners, along roads and in window reveals |
| Edge wear | distance-to-edge attribute < 3–8 cm × noise → lighter, less saturated paint; dark chipped spots on painted wood and metal ([UE smart edge wear](https://forums.unrealengine.com/t/paulareb-smart-edge-wear-procedural-mask-educational-breakdown/2728716)) | crisp highlights that catch the low sun |
| Sun bleaching | south and west faces and roofs: −saturation, +value | colour variation between facades of the same house |
| Per-building age | per-instance hash → grime amount, paint fade, repair patches | breaks "factory new" uniformity |

**Roads** (lane geometry is known, so masks come from distance to the lane centre and arc length):
- **Tyre paths.** Car track width is about 1.5–1.6 m, so wheel paths run at about ±0.75–0.8 m from the lane centre, each about 0.3–0.5 m wide. They are darker and smoother (polished; slightly higher spec when wet).
- **Oil strip:** a faint darker strip between the wheel paths at the lane centre, strongest where cars wait: before stop lines, at bus stops, in parking bays.
- **Braking marks** a few metres before stop lines and crossings.
- **Crack networks** from Voronoi cell edges × a low-frequency mask (more at kerbs and joints). Sealed cracks are black and glossy.
- **Patch repairs:** rectangles of different tone, axis-aligned to the lane.
- **Kerb dirt and leaf litter** in the gutter band, with puddles in gutters.

General approach: per-pixel lane distance plus arc length, the same inputs used to place dashes procedurally. Commercial procedural asphalt packs layer cracks, patches and stones the same way ([example](https://superhivemarket.com/products/asphalt-procedural-shader/docs)).

**Wet surfaces and puddles** (Lagarde, "Water drop" series; see [fxguide overview](https://www.fxguide.com/?p=43362)):
- **Wetting** *(from memory)*: `albedo *= mix(1.0, 0.3, wet·porosity)` and `gloss = min(gloss·mix(1, 2.5, wet), 1)`. Porous materials (asphalt, stone, soil) darken a lot; metal and glass don't.
- **Puddles:** in low spots from noise thresholded by a height or slope mask (flat only: [Axton UE4](https://axton.artstation.com/projects/nYeAJe), [Godot rain puddles](https://godotshaders.com/?p=16662)). Set the normal to up, F0 to 0.02, roughness to about 0.02–0.05, and keep the albedo dark. With the lamp-light function, puddles mirror street lamps at night, which is a big "real city" cue. Optionally use ripple rings when it rains.
- After rain or at dawn, use wet edges only (a 3–5 cm darker rim around the puddle).

**Implementation notes:**
- Prefer ALU noise in world space to big canvas textures, but beware ALU cost on full-screen surfaces at 1920×1025. For large areas like roads and facades, a small 256² tileable noise texture plus hex-tiling is cheaper than 3+ octaves of ALU noise per pixel.
- Fade high-frequency masks by distance and `fwidth` so they never shimmer at the overview.

---

## 6. Water: "real river" cues

- **Depth colour (Beer–Lambert).** Use `T = exp(−depth·σ)` per channel, with σ_red > σ_green > σ_blue for clear water, or a greenish-brown for a river. Water is shallow and bright near the banks and dark in the channel. Depth comes either from a depth-buffer difference or, better here, from known terrain: `terrain.height` under the water is analytic, so there is **no depth texture needed**. That works around the forum caveat that depth-buffer foam breaks with camera angle ([forum](https://discourse.threejs.org/t/unlit-water-shader-with-foam/11641)).
- **Shore foam and wet bank.**
  - Foam: thin broken lines where depth < 5–20 cm, broken by noise and animated along the flow.
  - Wet bank: a darker band 10–30 cm above the waterline on the bank material (the wetting rule from 5).
  - Small lapping waves: modulate the foam band with `sin(shoreDist·k − t)` damped by depth.

  References: [toon water for the web](https://code.tutsplus.com/creating-toon-water-for-the-web-part-1--cms-30447t), [Godot depth foam](https://godotshaders.com/shader/water-with-foam-and-depth/), [Codrops stylized water](https://tympanus.net/codrops/?p=88608).
- **Flow.** Valve's flow maps (Vlachos SIGGRAPH 2010) scroll a ripple normal map along a 2D flow field, with **two phases blended 50 % out of phase** plus noise to hide the pulse. Grimes (GDC 2011) applies the same idea to foam and colour, with normal-distortion to match the ripples ([Vlachos](https://www.advances.realtimerendering.com/s2010/Vlachos-Waterflow(SIGGRAPH%202010%20Advanced%20RealTime%20Rendering%20Course).pdf), [Grimes](https://www.hlportal.de/files/GDC2011_BronwenGrimes_NonstandardTextures.pdf), [Catlike Coding](https://catlikecoding.com/unity/tutorials/flow/texture-distortion/)). For a planned river, the flow field is just the river centreline tangent × a speed profile (fast in the middle, slow at the banks, eddies behind piers), computed at boot.
- **Procedural ripple normals:** a sum of 4–8 directional sine or Gerstner micro-waves with analytic derivatives, plus 1–2 octaves of gradient noise. Fade the high frequencies by `fwidth` to avoid glitter at distance. Add wind patches (3.5).
- **Reflections and Fresnel.** The single biggest "real water" cue is a correct Fresnel reflection of the **banks, reeds, trees and sky**, broken by ripples. The planar reflection is the canonical method (UE5 Water, three.js WaterMesh) and costs a second scene pass ([Cinevva water](https://app.cinevva.com/es/blog/2026-05-12-open-world-browser-part-26-water)). Keep the target small, include only tall features near water (opt-in), and distort it by the ripple normal.
- **Reeds, rushes and lily pads:**
  - Reeds: the same instanced-blade system as grass, with taller blades (1–2 m), darker and bluer green, and cattail heads (cylinders) on about 5 % of them. Place them in a band where water depth is 0–0.4 m and on the bank 0–1 m from the waterline; densest on inner bends and in calm water, absent where the flow is fast and at quays.
  - Lily pads: instanced flat discs with a notch in calm, shallow water (eddies, pond), bobbing on `water.waveHeight`.
  - Reflections of reeds in still water are a top realism cue, so let the reed mesh opt into the reflection pass (low LOD).
  - Floating debris and leaves drift along the flow field (CPU, a few dozen).

---

## 7. Colour and lighting: golden hour and miniature vs real

### 7.1 What makes golden hour read as "breathtaking"
- **Warm, low key light and a cool sky fill.** Shadows go blue-violet while lit surfaces go amber; the complementary contrast is the look. Shadows are long and textured.
- **Haze lit by the sun.** A warm glow toward the sun from the directional in-scatter lobe (2.2), blue-grey layers away from it. Distant layers separate by value, not by detail.
- **Backlit translucency** on grass, leaves, flags and smoke. Barré-Brisebois & Bouchard, GDC 2011, "Approximating Translucency for a Fast, Cheap and Convincing Subsurface Scattering Look" *(formula from memory)*:
  ```glsl
  vec3  Lt = L + N * distortion;                          // distortion ≈ 0.2–0.5
  float t  = pow(saturate(dot(V, -Lt)), power) * scale;   // power 4–12
  col += albedo * sunCol * (t + ambientT) * thickness;    // thickness: thin leaf/blade edges ≈ 1
  ```
  Physical background: [Habel et al. 2007](https://www.cg.tuwien.ac.at/research/publications/2007/Habel_2007_RTT/Habel_2007_RTT-Preprint.pdf), which argues view dependence is weak for leaves, so wrap plus transmission approximations are justified.
- **Rim highlights** on silhouettes facing the sun, and **bloom** that catches those backlit edges plus the sun disc and the haze glow. Keep the bloom threshold high enough that only the hot edges bloom; otherwise it washes into fog.
- **Exposure:** slightly under-exposed relative to noon, so the warm tones stay saturated instead of clipping to white.

### 7.2 Tone mapping and grading
- **AgX vs ACES vs Neutral (three.js).** ACES Filmic shifts hues as values brighten (oranges go yellow, and bright reds go pink or orange) and can look low-contrast. AgX desaturates toward white instead; out of the box it is less saturated than ACES, which is expected ([forum](https://discourse.threejs.org/t/is-agx-tonemapping-implemented-correctly/60609), [overview](https://discourse.threejs.org/t/tone-mapping-overview/75204)).
- **AgX looks.** three.js's AgX applies *no* look (the `agxLook` line is commented out). The common minimal-AgX looks are ASC CDL applied in AgX log space before the sigmoid's output transform ([Needle diff](https://engine.needle.tools/docs/api/@needle-tools/engine/3.42.0-beta/diff.html), [AgXc](https://www.github.com/MrLixm/AgXc)):
  - **Golden:** slope (1.0, 0.9, 0.5), power 0.8, sat 0.8.
  - **Punchy:** slope 1, power 1.35, sat ≈ 1.4 (the sat value is unverified).

  A time-of-day-driven blend toward "Golden" at golden hour is a physically sane warm grade. Because look.ts already does the tone map itself (`TONE_FN`), a CDL can be inserted there.
- **Procedural LUTs.** postprocessing has `LookupTexture.createNeutral(size)` (verified in `node_modules`) and `LUT3DEffect`. Build a 32³ neutral LUT, run the grade maths on its texels on the CPU (or render once into it), and swap or blend LUTs by time of day. This turns any number of grading operations into one 3D texture tap ([pmndrs LUT](https://react-postprocessing.docs.pmnd.rs/effects/lut)). Watch for the historical neutral-LUT darkening and tetrahedral banding issues reported in old versions. The current `look.ts` ALU grade is already cheap, so a LUT only helps if the grade grows (split-toning curves, hue-vs-hue, per-time keyframes).

### 7.3 Miniature vs real: what the research says
- **Held, Cooper, O'Brien & Banks 2010**, "Using Blur to Affect Perceived Distance and Size", ACM TOG 29(2) ([eScholarship](https://escholarship.org/uc/item/3ts0x35k)). Defocus blur is a depth and *scale* cue. The visual system infers absolute distance from the blur magnitude relative to the depth range. Large blur over a scene implies a short focal distance, so the scene is small. Blur must be consistent with the scene's depth gradient (a geometrically correct blur, or an approximation such as a linear vertical gradient on a ground plane seen from above) to produce miniaturisation.
- **Meese, Baker & Summers 2012**, i-Perception ([abstract](https://journals.sagepub.com/doi/abs/10.1068/id223)). With fake tilt-shift blur applied to real railway photos, observers mistook a *1:76 model* for the real scene. The key factor was alignment of the blur with the subject, not the gradient itself.
- **Qian & Miura 2019**, KST ([IEEE](https://ieeexplore.ieee.org/document/8687411)). **Higher saturation and lower lightness strengthen the miniature effect** in bird's-eye photos.
- Practice and folklore (photography guides; not controlled studies):
  - A high downward vantage point reads as a model.
  - Sped-up motion reads as small: small things move "too fast" for their size.
  - A missing horizon and missing haze read as a tabletop.

| reads as MINIATURE | reads as REAL PLACE |
|---|---|
| strong tilt-shift / shallow DOF (Held, Meese) | deep focus; at most mild DOF only at eye level |
| high-angle view, no horizon in frame | horizon or distant terrain visible, sky in frame |
| saturated, uniform "plastic" colours (Qian & Miura) | muted, varied colours; distance desaturates toward the sky colour |
| uniform sharpness and contrast at all distances | aerial perspective: contrast and saturation fall with distance |
| visible base, edges, table, cross-section | world continues to the horizon |
| clean, uniform, new surfaces; repeated assets | imperfection, weathering, variety, organic clutter |
| motion too fast for scale; rigid motion | correct speeds, plus secondary motion (sway, flutter, smoke drift) |
| soft, large shadow penumbrae relative to objects (studio light) | crisp sun shadows with a scale-correct penumbra, plus blue sky fill |
| sparse vegetation lumps | dense foliage at every scale (grass, weeds, leaves) |

**Implication.** The tilt-shift DOF and the saturated grade are *literally the two experimentally proven miniaturising cues*. For the "real world" default:
- Restrict DOF to near-ground and eye-level views (or remove it at the overview).
- Let saturation fall with distance.
- Show horizon, sky and haze.
- Keep the diorama look as an opt-in mode (the lead's `?diorama` plan).

---

## 8. Top recommendations for an integrated-GPU WebGL2 scene (ranked by visual gain per ms)

1. **Atmosphere first** (≈ 0 ms). Use per-channel exponential height fog plus a sun-direction in-scatter lobe in a global `fog_fragment` override, with colour pulled from the sky function; β ≈ 2–4e-4/m at golden hour, plus a 10–30 m valley-mist layer. Desaturate with distance. Without this, nothing else will read as "real".
2. **A world beyond the slab** (≈ 0.2–0.4 ms). Add 3 ring meshes of ridged-noise mountains and forest at 1.5–9 km with per-vertex fog, and mid-distance forest as instanced low-poly or boot-baked impostors. Turn the tilt-shift DOF off or way down at the overview and add a horizon to hero framings.
3. **A meadow ground shader** (≈ 0.1–0.3 ms). Lawns become grass-coloured patchwork with wind sheen bands from the shared gust field, a flower speckle with `fwidth` fade, and backlit brightening. It carries the overview where blades are sub-pixel.
4. **One shared wind field** (≈ 0 ms) in GLSL plus a TS mirror. Use it for grass, trees (Crysis main + detail bending), flags, smoke shear and water cat's paws, so a gust visibly travels through everything.
5. **Near-ring blades and flowers** (budget ≤ 0.5M vertices, ≈ 1.5–2 ms, measure first). Camera-snapped tiles drawn as one instanced draw per LOD; blades from `gl_VertexID` plus a hash; 11 → 3 vertex LODs; Voronoi clumps; a min-pixel-width floor; no shadow casting; opaque (no discard). Flowers come from the same instances.
6. **Backlit translucency everywhere** (≈ 0 ms): the Barré-Brisebois term on leaves, blades, flags and smoke (HG g ≈ 0.7), plus an AgX "Golden" CDL blend at golden hour.
7. **Weathering masks** in existing materials (≈ 0.1–0.3 ms): rising damp, sill streaks, moss on north faces, AO grime, road tyre paths and oil strips, puddles that mirror lamps at night. Generator knowledge supplies the masks with no textures.
8. **River life** (≈ 0.1–0.3 ms): reeds and lily pads from the grass system in shallow bands (opted into the reflection), analytic depth colour from known terrain, flow-aligned ripples, wind patches.
9. **Smoke:** soft-particle depth fade, an HG forward-scatter rim and erosion over life; more chimneys at low rates.
10. **Skip or defer:** physical LUT atmospheres (Hillaire or Bruneton), screen-space god rays unless the sun is in frame, shell grass over large areas, alpha-card forests near the camera, grass in the shadow map.

Measure each with `scripts/perf.mjs` variants; the GPU timer-query adaptive quality should treat grass density as a knob.

---

## Sources (all links)
Grass: [GoT GDC Vault](https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass) · [GoT YouTube](https://www.youtube.com/watch?v=Ibe1JBF5i5Y) · [tigerabrodi 1](https://tigerabrodi.blog/grass-in-ghost-of-tsushima) · [tigerabrodi 2](https://tigerabrodi.blog/what-we-can-learn-from-grass-in-ghost-of-tsushima-renders) · [SimonDev Quick_Grass](https://github.com/simondevyoutube/Quick_Grass) · [windcrest](https://github.com/kloserock97-tech/windcrest) · [Bruno Simon folio-2025](https://github.com/brunosimon/folio-2025) · [GodotGrass](https://github.com/2Retr0/GodotGrass) · [jairsantana](https://jairsantana.com/posts/grass/) · [Unity GoT port](https://github.com/harlan0103/Grass-Rendering-in-Modern-Game-Engine) · [csarko meadow](https://csarko.sh/research/grass-and-trail-realism) · [three.js 1.5M](https://discourse.threejs.org/t/interactive-grass-with-multi-player-physics-and-wind-fps-friendly-and-suitable-for-games/87994) · [three.js 1M](https://discourse.threejs.org/t/real-time-grass-simulation-in-the-browser-over-1-million-blades-at-60-fps/82808) · [three.js 3M](https://discourse.threejs.org/t/performance-optimizing-3m-instanced-grass-in-three-js/81286) · [most performant grass](https://discourse.threejs.org/t/whats-the-most-performant-way-to-make-grass/39774) · [Codrops fluffy grass](https://tympanus.net/codrops/?p=83092) · [Codrops False Earth](https://tympanus.net/codrops/2026/04/21/false-earth-from-webgl-limits-to-a-webgpu-driven-world/) · [keaukraine vegetation](https://keaukraine.medium.com/efficient-webgl-vegetation-rendering-b09a7fa904cc) · [hexaquo grass series](https://hexaquo.at/pages/grass-rendering-series-part-1-theory/) · [Jahrmann 2017](https://www.cg.tuwien.ac.at/research/publications/2017/JAHRMANN-2017-RRTG/JAHRMANN-2017-RRTG-draft.pdf) · [Habel 2007 grass](https://www.cg.tuwien.ac.at/research/publications/2007/Habel_2007_IAG/Habel_2007_IAG-Preprint.pdf) · [Cinevva budgets](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-05-budgeting-the-pretty) · [Cinevva grass](https://app.cinevva.com/blog/2026-05-14-open-world-browser-part-28-grass-and-occlusion) · [Cinevva occlusion](https://app.cinevva.com/blog/2026-05-19-terrain-occlusion-culling) · [Quest grass thread](https://discussions.unity.com/t/any-clever-trick-for-tall-grass-on-mobile-quest/811738) · [Igalia LRZ](https://blogs.igalia.com/siglesias/2021/04/19/low-resolution-z-buffer-support-on-turnip/) · [Mesa LRZ](https://docs.mesa3d.org/drivers/freedreno/hw/lrz.html) · [Adreno X1-45](https://www.notebookcheck.net/Qualcomm-Adreno-X1-45-2-1-TFLOPS-Benchmarks-and-Specs.885866.0.html) · [shell grass](https://godotshaders.com/shader/fur-grass-with-shell-texturing/) · [hex tiling](https://jcgt.org/published/0011/03/05/paper.pdf) · [Poisson scatter](https://gamedev.net/blogs/entry/2270025-poisson-disk-sampling-for-random-entities-placement/) · [CropCraft](https://arxiv.org/pdf/2511.02417) · [HZD vegetation](https://gdcvault.com/play/1025066/Between-Tech-and-Art-The) · [HZD placement](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf) · [TF culling](https://community.khronos.org/t/instance-shader/73587) · [instanced culling](https://discourse.threejs.org/t/ideas-on-performing-fast-per-instance-frustum-culling-on-instancedmesh/85156)

Atmosphere: [IQ fog](https://iquilezles.org/articles/fog/) · [demofox](https://blog.demofox.org/2014/06/22/analytic-fog-density/) · [MonoGame rd.y](https://community.monogame.net/t/solved-height-distance-based-fog-again/14371) · [UE height fog](https://dev.epicgames.com/documentation/en-us/unreal-engine/exponential-height-fog-in-unreal-engine) · [Hillaire paper](https://diglib.eg.org/handle/10.1111/cgf14050) · [Hillaire slides](https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf) · [sebh code](https://github.com/sebh/UnrealEngineSkyAtmosphere) · [webgpu-sky-atmosphere](https://github.com/JolifantoBambla/webgpu-sky-atmosphere) · [Vulkan thesis](https://cescg.org/wp-content/uploads/2023/04/Sakmary-Real-time-Rendering-of-Atmosphere-and-Clouds-in-Vulkan.pdf) · [takram atmosphere](https://unpkg.com/@takram/three-atmosphere@0.13.2/README.md) · [Maxime Heckel sky](https://blog.maximeheckel.com/posts/on-rendering-the-sky-sunsets-and-planets/) · [Valve cubemap fog](https://developer.valvesoftware.com/wiki/Env_cubemap_fog) · [gradient fog (Firewatch)](https://hyphinett.itch.io/gradient-fog-for-unity) · [Godot gradient fog](https://godotshaders.com/shader/distance-gradient-fog-4-3/) · [three.js fog/sky](https://discourse.threejs.org/t/matching-fog-color-with-the-sky-shader/52018) · [depth→world](https://discourse.threejs.org/t/reconstruct-world-position-in-screen-space-from-depth-buffer/5532) · [Koschmieder](https://codingace.net/physics/visibility_koschmieder.html) · [GPU Gems 3 ch13](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process) · [pmndrs god rays](https://react-postprocessing.docs.pmnd.rs/effects/god-rays) · [three-good-godrays](https://cdn.jsdelivr.net/npm/three-good-godrays@0.12.0/README.md) · [Unity SunShafts](https://docs.unity3d.com/550/Documentation/Manual/script-SunShafts.html) · [mountain bg shader](https://godotshaders.com/shader/mountain-background-shader/) · [Hoffman/Preetham AP](https://research.cs.wisc.edu/graphics/Courses/779-s2003/final_projects/dwleonar/Cg%20Aerial%20Perspective%20with%20Procedural%20Terrain.htm) · [Patry SIGGRAPH 2021](https://www.advances.realtimerendering.com/s2021/jpatry_advances2021.pdf) · [impostors three.js](https://discourse.threejs.org/t/octahedral-impostors-for-three-js/80318) · [impostor forest](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735) · [Godot impostors](https://github.com/SIsilicon/Godot-Octahedral-Impostors) · [Zucconi impostors](https://www.alanzucconi.com/?p=9941) · [Cinevva impostors](https://app.cinevva.com/blog/2026-05-04-open-world-browser-part-19-imposters)

Wind: [GoT wind GDC](https://gdcvault.com/play/1027124/Blowing-from-the-West-Simulating) · [vorticles article](https://gamedeveloper.com/design/using-vorticles-to-simulate-wind-in-i-ghost-of-tsushima-i-) · [GPU Gems 3 ch16](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis) · [Book of the Dead wind](https://unity.com/en/blog/industry/book-of-the-dead-quixel-wind-scene-building-and-content-optimization-tricks) · [Komodo wind](https://forums.unrealengine.com/t/2422334) · [ez-tree](https://github.com/dgreenheck/ez-tree) · [flag shader](https://godotshaders.com/shader/3d-simple-animated-flag-shader/) · [foliage normals (polycount)](https://polycount.com/discussion/comment/2717502/)

Smoke: [soft particles](https://keaukraine.medium.com/implementing-soft-particles-in-webgl-and-opengl-es-b968d61133b0) · [three.js soft particles](https://discourse.threejs.org/t/soft-particles-render/504) · [CoH shaded smoke](https://simonschreibt.de/gat/company-of-heroes-shaded-smoke) · [six-way smoke](https://realtimevfx.com/t/solved-6-way-lightmap-smoke-in-unreal/13844) · [GPU Gems 3 ch23](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles) · [McGuire smoke](https://history.siggraph.org/wp-content/uploads/2023/01/2004-Poster-026-Mcguire_Real-Time-Cartoon-Rendering-of-Smoke.pdf) · [HG phase](https://mitsuba.readthedocs.io/en/latest/src/generated/plugins_phase.html) · [The Spirit](https://experiments.withgoogle.com/the-spirit)

Weathering: [Valve moss](https://developer.valvesoftware.com/wiki/Moss) · [up-mask](https://polycount.com/discussion/comment/2102170/) · [Unigine SSDirt](https://developer.unigine.com/ru/docs/latest/editor2/settings/render_settings/ssdirt/?rlang=cpp) · [curvature node](https://developer.unigine.com/docs/latest/content/materials/graph/node_library/misc/curvature) · [edge wear UE](https://forums.unrealengine.com/t/paulareb-smart-edge-wear-procedural-mask-educational-breakdown/2728716) · [Lagarde wet (fxguide)](https://www.fxguide.com/?p=43362) · [puddle slope mask](https://axton.artstation.com/projects/nYeAJe) · [Godot puddles](https://godotshaders.com/?p=16662) · [asphalt procedural](https://superhivemarket.com/products/asphalt-procedural-shader/docs)

Water: [Vlachos flow](https://www.advances.realtimerendering.com/s2010/Vlachos-Waterflow(SIGGRAPH%202010%20Advanced%20RealTime%20Rendering%20Course).pdf) · [Grimes GDC 2011](https://www.hlportal.de/files/GDC2011_BronwenGrimes_NonstandardTextures.pdf) · [Catlike flow](https://catlikecoding.com/unity/tutorials/flow/texture-distortion/) · [toon water](https://code.tutsplus.com/creating-toon-water-for-the-web-part-1--cms-30447t) · [Godot water foam](https://godotshaders.com/shader/water-with-foam-and-depth/) · [Codrops water](https://tympanus.net/codrops/?p=88608) · [three.js water foam](https://discourse.threejs.org/t/unlit-water-shader-with-foam/11641) · [Cinevva water](https://app.cinevva.com/es/blog/2026-05-12-open-world-browser-part-26-water)

Colour / perception: [AgX three.js](https://discourse.threejs.org/t/is-agx-tonemapping-implemented-correctly/60609) · [tone mapping overview](https://discourse.threejs.org/t/tone-mapping-overview/75204) · [pmndrs tone mapping](https://discourse.threejs.org/t/pmndrs-post-processing-tone-mapping-guidance/59374/2) · [AgXc](https://www.github.com/MrLixm/AgXc) · [AgX looks (Needle)](https://engine.needle.tools/docs/api/@needle-tools/engine/3.42.0-beta/diff.html) · [pmndrs LUT](https://react-postprocessing.docs.pmnd.rs/effects/lut) · [Habel leaf translucency](https://www.cg.tuwien.ac.at/research/publications/2007/Habel_2007_RTT/Habel_2007_RTT-Preprint.pdf) · [Held 2010](https://escholarship.org/uc/item/3ts0x35k) · [Meese 2012](https://journals.sagepub.com/doi/abs/10.1068/id223) · [Qian & Miura 2019](https://ieeexplore.ieee.org/document/8687411) · [tilt-shift practice](https://www.studiobinder.com/camera-shots/focus/tilt-shift-shot/)
