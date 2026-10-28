# W2 — Vehicles ("real things" round)

Branch `claude/real-w2-vehicles` (from `claude/pensive-gates-bim12i`). Brief: `docs/progress/real-briefs.md` W2.
Owned: `src/sim/traffic/{models,vehicleMaterial,render}.ts` (+ trains later). Sim untouched.

## Resume here
* 2026-10-28 — Milestone 1 done (cars, vans, lorry, bus, ice-cream van: priorities 1–5 + wear/variation).
  Next: (a) ice-cream van close look (body now extruded with arches + framed cab glass, unchecked at 3 m);
  (b) SUV: cladding/arch flares, roof rails detail; (c) taxi/police roof parts check; (d) night regression check
  (21.5 h: cabin emission, bus cabin glow, lamp lenses); (e) perf numbers below; (f) then trains (audit #7).
* Judge with the showroom: `node scripts/capture-set.mjs --q "tlineup&nointro&noidle" --hideui 1 --views
  "-10,0.9,22,4,30,6;-8,1.4,35,9,25,8" --hours 11 --out shots/w2/x` (row 1 cars at z 22 from x −17, row 2
  vans/lorries/buses at z 35; yaw 0 ≈ front, 180 ≈ rear). Bench: `--classes car,bus --yaws 0,140` (new option).

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
* **Ice-cream van**: extruded body with arches, framed cab glass + interior, wipers, round lamp lenses, plates.
* Tools: `bench.mjs --yaws 0,140` (extra yaw offsets per capture); `capture-set.mjs` views split on `;` so
  coordinate views work; `?tlineup` items get different phases (plates/wear vary).

## Toggles + tiers
* `?nocarinterior` (cabin ray-trace; also off on quality **low**), `?nopanelgaps`, `?novehiclewear`.
  Geometry detail (wheels, wipers, seals, handles) lives in LOD 0 (< 62 m scaled), LOD 1 keeps textured
  wheel faces, LOD 2 unchanged.
* Cost: see "Perf" (software GL, compare within one run only).

## Tried and rejected
* Interior as diffuse colour lit by the pane normal: side windows in shade went black and sunny ones glowed
  grey — emitted "daylight" (× 0.32 under AgX) reads right.
* Arms as one axis-aligned ellipsoid: a blob. Three spheres along the arm instead.
* A scuttle strip under the wipers: its ends showed as black wedges over the bonnet shoulders.

## Open / not mine
* Wavy horizontal streaks on large flat close surfaces (lorry headboard at 6 m) persist with
  `?novehiclewear` — not the wear shader (close-range DOF / shadow?).

## Sheets
* before: `shots/w2/before/` (bench car/bus 3/8/25 m); after: `shots/w2/l2`, `l4` (showroom), `b1` (bus).
