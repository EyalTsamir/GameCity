# W2 — Vehicles ("real things" round)

Branch `claude/real-w2-vehicles` (from `claude/pensive-gates-bim12i`). Brief: `docs/progress/real-briefs.md` W2.
Owned: `src/sim/traffic/{models,vehicleMaterial,render}.ts` (+ trains later). Sim untouched.

## Resume here
* 2026-10-28 session 2 — **Milestone 2 pushed** (car form + bus ends/doors + grime). Stopped at the context cap.
  Next session, in order: (a) judge `docs/progress/real/w2_m2_*.jpg` with fresh eyes (left = before, right = after);
  (b) car polish: front badge still reads as a blue chip (chrome reflecting sky), horizon-reflection line on the
  bonnet roll is jaggy, rear bumper corners still slab-like at the bottom (cap bands 1–3), SUV/compact lamp
  proportions, bonnet front shut line; (c) bus rear window shows only grey (sky reflection over the cabin);
  bus arch skirt tongue is jagged; (d) van/lorry/ice-cream still box ends (could reuse busBody.ts' loft);
  (e) trains (audit #7) — not started. Perf of this milestone not measured (only build-time cost + a few hundred
  extra LOD0 triangles per car; same draw calls).
* 2026-10-28 — Milestone 1 done and pushed (cars, vans, lorry, bus, ice-cream van: brief priorities 1–6;
  7 "mechanics" (pitch/roll) already existed in render.ts). Session stopped at ~310k context.
  Next session, in order: (a) verify the roof box (part 90, ~1 vehicle in 5 by phase) on parked cars
  (`bench.mjs --classes car --pick 1..4`) — not yet seen in a capture; (b) remaining car items: bonnet front
  shut line, exhaust tip, third brake light, SUV arch flares; bus: rear dirt spray, roof gutter ridge;
  (c) a fresh-eyes review of the sheets below against the photo tests; (d) Adreno cost of the cabin ray-trace
  (only measurable on the user's machine; tier off on low already); (e) trains (audit #7: trainModels.ts
  already has bogies/pantograph/gangway — start with a bench `--classes train --dists 3,10` and judge).
* Judge with the showroom: `node scripts/capture-set.mjs --q "tlineup&nointro&noidle" --hideui 1 --views
  "-10,0.9,22,4,30,6;-8,1.4,35,9,25,8" --hours 11 --out shots/w2/x` (row 1 cars at z 22 from x −17, row 2
  vans/lorries/buses at z 35; yaw 0 ≈ front, 180 ≈ rear). Bench: `--classes car,bus --yaws 0,140` (new option).

## Code map, milestone 2 additions
* `src/sim/traffic/carBody.ts`: `ringAt` (10 ring points incl. arch flare, bumper line, crowned bonnet/roof) +
  end zones (`NOSE`/`TAIL` tables: per-point set-back `sb`, plan inset `ix`, roll `dy`, length `r`; quarter-ellipse;
  `SWEEP_*` plan curve); caps are horizontal bands × 8 columns; regions + `bumper`, `gap` (shut-line strip along
  ring point 3); `endSurface(s,x,y,sign)` (numeric surface z + normal, verified against a raycast to < 1 mm);
  `endRing`; `bumperTop`.
* `src/sim/traffic/busBody.ts` (new): same scheme for the bus (`loftBus`, `busEndSurface`), regions body / skirt /
  bumper / glass (windscreen = bands 6–7 in the nose zone) / seal / well; flanks get flat normals.
* `models.ts`: `onEnd(surf|shape, sign, x0,x1,y0,y1, off, nu)` conformal decal grid (3 rows at LOD0 — one row cut
  through the bumper ledge and hid the lenses behind the housing rim), `flatOnEnd(..., geo?)` tilted flat parts;
  `carDetails(b, d, shape)` places lamps / blinkers / grille / intake / plates / badges from `endRing` heights
  (lamps above the bumper ledge `y4`); `loftBody(..., bumper)` finish per model; mirrors on a sail + arm.
* `vehicleMaterial.ts`: `TH_GAP` macro (dark core + rolled panel edges via normal tilt, fades with `pix`), door
  bottom line; grime = road film low + noisy fade (every vehicle has some, `0.22 + 0.78 h²`).

## Code map (file:line at d420fe9+)
* `src/sim/traffic/vehicleMaterial.ts`: `VERT_BEGIN` :88 (tyre flatten, object-space varyings, camera in the
  object frame; detail class = floor(aPart/100)); `FRAG_DETAIL` :136 (interior, panel gaps, crease, dent,
  wear, night cabin); `thInterior` :297 (cabin ray-trace, styles 2 car / 4 bus / 5 van); per-vehicle plate
  cell in the `uv_vertex` patch :423; `thHidden` part 90 = roof box by phase (vertex + depth material).
* `src/sim/traffic/models.ts`: atlas regions after `R_TARP` (~:66), `drawDetailAtlas` :84; `Builder` :632
  (`det`, `plate` options → aDetA/aDetB, aMeta.z = −1); `wheel` :895; `carDetails` :1026; `loftBody` :1088
  (panel/cabin data); `roofBox` :1132; `rakedScreen`/`cabSide`/`archLiner` :1222+; `delivery` :1262;
  `lorry` :1342; `archedSlab`/`roundPane` :1427; `bus` :1490; `icecream` :1593.
* `src/sim/traffic/render.ts`: detail uniform + URL toggles :109, set per frame from `ctx.quality.level`.
* Limit: 16 vertex attributes are all used (hence the class packed into aPart).

## Done (milestone 1)
* **Shader layer** (`vehicleMaterial.ts`, one shared material, no extra draw calls): per-part detail class in
  `aPart` (+100 × class; the 16-attribute limit forbids a separate attribute), data in `aDetA/aDetB`;
  object-space position/normal and the camera in the object frame as varyings.
  * Class 2/4/5 glass → **ray-traced cabin** (interior mapping in the object frame): dash, steering wheel,
    front seats with headrests, rear bench, a **driver** (ellipsoid torso, arms to the wheel, head with hair,
    muted clothes / skin tones by hash) when the vehicle is moving (parked cars are empty); bus: rows of
    blue seats both sides of the aisle, yellow poles, seated passengers, a driver; van/lorry: cab seats +
    bulkhead. Emitted as daylight under the glass reflection (diffuse base darkened).
  * Class 1 car paint → **panel gaps** (door cuts, cowl, bonnet + boot fender seams; AA'd to coverage far
    away), a **shoulder crease** (normal tilt into paint + clear coat).
  * **Wear**: road grime on the lower body / wheels (per-vehicle amount, many clean), a door **dent** (22 %),
    a mismatched replacement door (8 %), sun-faded paint (28 %).
  * Class 3 tyre → contact patch flattening in the vertex shader (after the spin).
  * Sin-free hash (the sin hash speckled at large arguments).
* **Atlas 512 → 1024**: 16 number plates (EU style, "TH" band, legible random registrations; picked per
  vehicle by its phase), headlamp clusters (bowls, LED strip), round lamp, tail lamp (ribs, reverse lamp),
  bus twin lamps, tyre strip (tread blocks, sidewall lettering), wheel faces for LOD1, hub cap, grilles.
* **Cars**: plates on holders front/rear, lamp lens decals (mirrored per side), flush blinkers (the corner
  cubes stuck out of the rounded nose), grille decal + badges, bumper finish per model (compact chrome,
  hatch/sedan body colour + dark insert, SUV dark), mirror glass, recessed door handles, wipers.
  **Wheels**: lathed tyre with rounded shoulders (tread + lettering texture), alloy (5 tapered dished spokes,
  lip, nuts, cap, brake disc, barrel), steel + domed hub cap (compact), steel truck/bus wheel (boss, 10
  nuts). LOD1: textured face disc; LOD2 as before.
* **Bus** rebuilt: extruded body with real wheel arches + liners (the wheels used to be buried in a box),
  route skirt following the arches, rounded windows in black seals with hopper bars, glazed two-leaf folding
  doors, windscreen in a surround with wipers, grille, twin lamp lenses, plates, ram's-horn mirrors on arms,
  roof hatches, engine louvres.
* **Box van**: cab lower body with an arch, raked windscreen + side windows in seals over the cab interior,
  door seam/handle, aluminium corner posts/rails, rear doors with hinges + locking bars, marker lamps, side
  guard, mirrors on arms, lamp lenses, plates.
* **Lorry**: cab with arch, windscreen/side windows in seals + interior, wipers, slatted grille + badge,
  steps, mirrors on arms, fuel tank / battery box, side guards, mud flaps, tarp straps.
* **Ice-cream van**: extruded body with arches, framed cab glass + interior, wipers, round lamp lenses, grille,
  plates.
* **Night**: lit bus cabins now show seats/poles/passengers lit by the cabin lamps (the flat LIGHT_CABIN glow
  on the glass is cut to 18 %); car lamp lenses glow with their reflector pattern. Checked at 21.5 h.
* **Variation**: roof box on two cross bars (hatch, SUV), shown for ~1 vehicle in 5 (part 90, by phase;
  depth material too). Bus passengers are ellipsoids now.
* Tools: `bench.mjs --yaws 0,140` (extra yaw offsets per capture); `capture-set.mjs` views split on `;` so
  coordinate views work; `?tlineup` items get different phases (plates/wear vary).

## Toggles + tiers
* `?nocarinterior` (cabin ray-trace; also off on quality **low**), `?nopanelgaps`, `?novehiclewear`.
  Geometry detail (wheels, wipers, seals, handles) lives in LOD 0 (< 62 m scaled), LOD 1 keeps textured
  wheel faces, LOD 2 unchanged.
* Perf (software GL, downtown 12 h, one run): baseline 766 ms/frame vs all three toggles off 753 ms (≈ +1.7 %,
  within noise), 167 draw calls both, triangles +0.04 % in that view (LOD 0 geometry is near-only).
  Not measured on the Adreno.

## Tried and rejected
* Single-row conformal decals on the car front: a quad spanning the bumper's top ledge cut in front of the lens.
* Flat end caps (milestone 1): the nose read as a box whatever the plan rounding; replaced by banded caps.
* Interior as diffuse colour lit by the pane normal: side windows in shade went black and sunny ones glowed
  grey — emitted "daylight" (× 0.32 under AgX) reads right.
* Arms as one axis-aligned ellipsoid: a blob. Three spheres along the arm instead.
* A scuttle strip under the wipers: its ends showed as black wedges over the bonnet shoulders.

## Open / not mine
* Wavy horizontal streaks on large flat close surfaces (lorry headboard at 6 m) persist with
  `?novehiclewear` — not the wear shader (close-range DOF / shadow?).

## Sheets
* Milestone 2: `docs/progress/real/w2_m2_car.jpg` (row 1 before, row 2 after: front 4 m, rear 3/4),
  `w2_m2_bus.jpg` (front / rear before → after), `w2_m2_more.jpg` (sedan/taxi/police, compact, bus doors, 12 m).
* `docs/progress/real/w2_car_before.jpg`, `w2_bus_before.jpg` (bench 3 m, base commit) →
  `w2_car_front_after.jpg`, `w2_car_side_after.jpg`, `w2_bus_after.jpg`, `w2_vans_after.jpg`,
  `w2_lineup_14m.jpg`, `w2_night_after.jpg`. Raw: `shots/w2/` (not committed).

## Tokens
* Session 2: golden m2 vs ref (merged base) mean diff 0.0–0.1 on all five views; downtown console clean, invariants 0.

## Tokens (session 1, tokens.py)
* 101 calls, 3.2M weighted; median context 229k, max 313k (over the 150k target: the first milestone was
  too big for one session — split the next into cars-polish / trains); cache reads 71 %, no cold rewrites
  (idle>5 min: 1 warm / 0 cold).
