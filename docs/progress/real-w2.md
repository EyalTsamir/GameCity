# W2 — Vehicles ("real things" round)

Branch `claude/real-w2-vehicles` (from `claude/pensive-gates-bim12i`). Brief: `docs/progress/real-briefs.md` W2.
Owned: `src/sim/traffic/{models,vehicleMaterial,render}.ts` (+ trains later). Sim untouched.

## Resume here
* 2026-10-28 session 4 — **fix round + trains pushed; wrapping at the context cap.** Next session, in order:
  (a) **train bench framing still fails**: the camera ends at window height against the car side (platform blocks
  the line of sight → arm shortened). Try `--q` with a free view from the track side (e.g. find a train with
  `__city.ctx.pickers`, place the camera on the far side of the tracks at y 0.8, pitch 0) and judge bogies, door
  seals, gangway, coupler, pantograph, roof pack, grime (none of the train work has been judged in a capture yet
  except the roof pack louvres and door portal at 3 m); (b) paint: two-layer + metallic is a modest gain (sheet
  row 1: left `?nocarpaint`, right on) — without real environment reflections the gloss stays limited; (c) tyre
  sidewall dust barely visible; (d) police livery decal is a flat plane at W/2 + 0.014 (floats off the tuck like
  the taxi band did); (e) perf not measured (estate/MPV = 2 new model kinds; train bogie/roof geometry +~1.5k tris
  per car). Sheet: `docs/progress/real/w2_s4_fix.jpg` (paint off/on; SUV rails; parked row with estate + MPV;
  bus roof AC; lorry pallets/crates/straps; bus front; mirror on its stalk).
* 2026-10-28 session 4 (fix round after judge-1 + bugs-1). Done in code (see "Session 4" below): (1) SUV roof rails
  on feet (`topSurfaceY` in carBody.ts, `roofRails()` in models.ts); (2) paint = two layers (`thBaseSpec` 0.22 under
  the coat, ~45 % metallic by phase hash, `?nocarpaint` → uVehDetail.w) + realistic fleet palette (BODY_COLORS);
  (3) parked-only body types `estate` + `mpv` (new ModelKinds, MOVING_CAP 0, pickParkedModel mix); (4) mirror shell
  (squircle, flat glass back) on a stalk; (5) tyre sidewall dust + sill spray band, min dirt 0.3; (6) bus roof AC
  pack (shroud, fan grilles, louvres) + framed hatches; (7) lorry loads on pallets: slat crates / cartons + ratchet
  straps; taxi chequer band sunk into the flank; bench bus framing (front end, yaw +28, pitch 5).
  Trains (started): bogie rebuilt (frames, axle boxes, coil springs, air/coil secondary, dampers, brakes, sand
  pipes), door seals + portal + button, gangway folds + drawbar + hoses, underframe lids/reservoirs/trunking, cab
  Scharfenberg coupler, pantograph insulator sheds + raising cylinder + shunts.
  Lineup now (yaw 0.35): row z 22 — compact −16.17/−12.91, hatch −9.61, sedans −6.25/−2.87/0.51, SUV 3.93,
  estate 7.36, MPV 10.78, van v0 14.35; row z 35 — vans −15.95/−12.25/−8.55, lorry crates −4.73, tarp −0.78,
  buses 3.25/7.35, ice-cream 11.2.
* 2026-10-28 session 3 — **Milestone 3 pushed** (lead items 1–4 done; context cap reached). Next session:
  (a) trains (audit #7) — not started: begin with `bench.mjs --classes train --dists 3,10` and judge; code in
  `src/sim/rail/trainModels.ts` (743 lines: `shell`/`bogie`/`wheelset`/`pantograph`/`gangway`/`buildEmu`/`buildLoco`/
  `buildWagon`, grep -n the section comments); (b) small leftovers: tarp end caps are flat (tucked folds would help),
  lorry headlamps a bit large, Luton peak still reads slightly pillowy, van has no step, crates have no pallets;
  (c) perf not measured (LOD0-only geometry: tarp ≈ 4k tris per near lorry; cab lofts replace the old boxes).
  Lineup coordinates (`?tlineup`, yaw 0.35): row z 22 — compact −16.2/−12.9, hatch −9.6, sedans −6.25/−2.9/0.5,
  SUV 3.9, vans v0–v2 7.5/11.2/14.9; row z 35 — van v3 −15.95, lorry v0 (crates) −12.1, v1 (tarp) −8.2, buses
  −4.15/−0.05, ice-cream 3.8. View = "x,y,z,dist-from-centre,yaw,pitch" (long vehicles: dist ≥ L/2 + 3).
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

## Session 4 (fix round) — done
* Judged on the showroom (`shots/w2/s4b/*`): SUV rails on 3 feet with daylight under the bar (real); estate (long
  roof) and MPV (one-box, tall) break the parked-row silhouette; bus roof AC reads as a GRP pack with fan grilles and
  louvres, hatches framed with domes; lorry load = pallets + slatted crates + taped cartons + orange ratchet straps;
  bus front = route band, dark bumper, grille, twin lamps, wipers, destination display (bench framing fixed).
* Mirror: the first ellipsoid read as a ball at 1.6 m → squircle (|x|^0.55, |y|^0.6), wider and flatter.
* Toggles: `?nocarpaint` (paint layers + metallic), `?notraingrime`; existing `?nocarinterior`, `?nopanelgaps`,
  `?novehiclewear`. New geometry is LOD 0 only (crate slats, carton tape, AC fans, rails' feet, mirror shell 14×8)
  except the estate/MPV bodies (all LODs, parked only → +2 InstancedMesh kinds × 3 LODs, drawn only when present).

## Trains (session 4) — done in code
* `bogie(g, z, r, wb, heavy, bodyY, coil)`: side frames as 5 beams (high over axle boxes, dropped centre), round axle
  boxes + covers, twin primary coils (3 coil rings each), brake units, sand pipes, air springs (EMU) or coil nests
  (loco, wagon), vertical + yaw dampers, transom + bolster. `doors`: leaf gaskets, nosing + edge seals, sill seal,
  grab recess (all move with the leaf), static portal surround + green door button (`sideQuad` helper).
  `gangway`: frame plate, 7 alternating folds, face plate + rubber, drawbar + head + air hoses. `emuUnderframe`:
  case shut lines, ribs, converter louvres, air reservoirs, cable trunking. Cab: Scharfenberg-type coupler
  (housing, shank, head, contact box, cover, hoses). `pantograph`: insulator sheds, raising cylinder, shunts.
  `boxRoofUnit`: chamfered prism shroud, 2 fan guards, side louvres. Material: grime (`uGrime`, `?notraingrime`):
  running gear brake-dust brown, lower-body film with noisy edge, roof dust.
* Bench framing for trains: target the leading bogie (5.2 m ahead along the heading), h 1.6, yaw +60, pitch 4.

## Code map, trains (session 4 reading)
* `src/sim/rail/trainModels.ts` uses `Geo` (`src/sim/rail/geo.ts`: `color/kind/variant/extra/box(cx,cy,cz,sx,sy,sz,skip)/
  block/beam/cyl(cx,y0,cz,r0,r1,h,seg,caps)/rod(a,b,r,seg)/sphere/prism/quad/tri/vert`). Tags `T.*` from trainMaterial.ts
  (PLAIN, WHEEL, WINDOW, DOOR, DOORWIN…); `g.extra(r,z,…)` = wheel pivot; doors use extra(0,0,leaf,side).
  `wheelset` :138 (12-seg tread + sector face), `bogie` :192 (side frame box, axle boxes, springs, bolster),
  `boxRoofUnit` :217, `pantograph` :225, `emuUnderframe` :277 (3 boxes), `windowRow` :290 (flat quads in a rubber
  quad), `doors` :307 (flat leaves + leaf window + step), `gangway` :340 (box + 4 rings), `buildEmu` :352,
  `buildLoco` :542, `container`/`buildWagon` :683+. EMU_PROF :260 (side x 1.45, floor 0.95 … roof 3.55+).

## Code map, session 3 additions
* `busBody.ts`: `BusShape` takes optional `nose`/`tail: EndProfile` (sb/ix/dy/r per ring point + `zone` + `sweep`),
  `tumble` (ring point 7 inset), `roofIn`/`roofDrop`, `glassD` (nose depth whose band 6–7 is glass). Flank faces get
  their own face normal (works with tumble). Windscreen seal strips now run 5 cm along the surface (raked screens),
  also across the end cap and down the glass side edges (bus too).
* `models.ts`: `cabShell(b, shape, zc, glass)` → EndFn (lofted cab, regions painted / bumper / well / glass / seal);
  `flankPane(b, shape, [z,y][], glass)` (side glass on the leaning flank, in a seal); `flankSeam`; `endLamp`
  (conformal lens in a dark housing); `paneOnEnd` (rounded pane conformed to an end, grid); `tarpLoad` (lofted
  tarp with bulges between straps, lumps, folds; straps + ratchets + hooks). `delivery()` = Luton: cab loft 2.5 m
  (rear 0.6 m inside the box), peak over the cab, joint strips, doors on VB(0,2) / roller shutter on VB(1,3).
  `lorry()` cab loft 1.9 m, visor, steps ahead of the front wheel, two mirrors, bed rails + hooks, ladder headboard.
* `carBody.ts` ringAt: flank points 2–6 reshaped (tuck-under, shoulder widest at belt − 0.15, roll-in to the belt);
  tumble +0.03 on every car.
* `render.ts`: parked phase = position hash (was linear → twins along E-W rows).

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
* Milestone 3: `docs/progress/real/w2_m3_vans.jpg` (row 1 before: van front, van side, lorry front; row 2 after),
  `w2_m3_more.jpg` (van rear doors before → roller-shutter variant, tarp + straps, bus rear conformed, taxi
  shoulder/tumblehome, parked row variation).
* Milestone 2: `docs/progress/real/w2_m2_car.jpg` (row 1 before, row 2 after: front 4 m, rear 3/4),
  `w2_m2_bus.jpg` (front / rear before → after), `w2_m2_more.jpg` (sedan/taxi/police, compact, bus doors, 12 m).
* `docs/progress/real/w2_car_before.jpg`, `w2_bus_before.jpg` (bench 3 m, base commit) →
  `w2_car_front_after.jpg`, `w2_car_side_after.jpg`, `w2_bus_after.jpg`, `w2_vans_after.jpg`,
  `w2_lineup_14m.jpg`, `w2_night_after.jpg`. Raw: `shots/w2/` (not committed).

## Tokens
* Session 4 (tokens.py): 145 calls, 3.4M weighted, ctx median 194k / max 274k (over the cap again: image reads + long
  waits on software-GL captures; next session: one bench run per judgment, fewer screenshots). Checks: downtown console
  clean, invariants 0, typecheck clean.
* Session 3 (tokens.py): 79 calls, 2.0M weighted, ctx median 188k / max 239k (system + brief ≈ 37 % — the
  floor is high; keep sessions to one milestone). Checks: downtown console clean, invariants 0; overview unchanged.
* Session 2: golden m2 vs ref (merged base) mean diff 0.0–0.1 on all five views; downtown console clean, invariants 0.

## Tokens (session 1, tokens.py)
* 101 calls, 3.2M weighted; median context 229k, max 313k (over the 150k target: the first milestone was
  too big for one session — split the next into cars-polish / trains); cache reads 71 %, no cold rewrites
  (idle>5 min: 1 warm / 0 cold).
