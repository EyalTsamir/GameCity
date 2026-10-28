# W5 — trees (bases), ground contact, kerbs, fences, signs, lamp posts

Branch `claude/real-w5-street` (from claude/pensive-gates-bim12i @ 6c29a46). Brief: real-briefs.md "W5".

## Resume here
* Session 2 pushed (lead priorities 1–6, all addressed; stopped at 252k context — over the cap). Next session:
  1. VERIFY the utility-lid fix (priority 2) at 3 m: bench `fence --pick 1..5` until a garden gate frame with a lid
     (markings.ts 'lid' decal, footway lat 4.6–6.0). Not yet seen after the redraw.
  2. Static perf A/B without sim noise: `perf.mjs --q "hide=traffic,pedestrians" --view "0,0,-40,12,30,12"
     --variants ";nonearcut;nolampdetail&nofencedetail&nosigndetail&notreebase&nokerbdetail"` (perf_s2c had
     ±30k noise from traffic/peds). Check the overview (`shot.mjs --view overview`) — not re-checked in s2.
  3. Draw calls: near cells add ~7 (≤ 4 lamp cells, 2 signal cells, +1 street-name mesh, + vegetation grate
     cells). If too many: NEAR_CELL 48 → 64 with NEAR_CUT 25, or share one cell grid/material across owners.
  4. Name blades: flag blades on signal poles (offset 0.4 + r) not yet seen after the offset change; add a
     bracket. STOP letters are thin/low contrast at 3 m.
  5. Kerb: shader-only height jitter (normal tilt per stone); real geometric steps would cost ~+400k tris.
* s2 done: see "Done (s2)" below.

## Done (s2)
* Near cut (src/world/lamps/nearCells.ts): 48 m cells, drawn within 30 m of the camera. Users: props.ts `KD` (lamp
  near kit), signals.ts `place(.., fine)` (bolts, clamps, hatch, button, visor cheeks, arm cap/collar, STOP
  fixings + sticker), vegetation.ts `NC` (grate rings/ribs/bars + litter; plants.ts surround(.., near)).
  Base shafts 16 → 12 segments, round arm 8 segments. ?nonearcut = A/B.
* Gate-frame dark rectangle = footway utility-lid decal (dark #8a square + diagonal stripes aliasing at grazing
  angles). Redrawn as embossed galvanised chequer-plate lid with frame, legend "GAS", keyholes; lighter tint.
* Kerb (roads/glsl.ts rdHard special 6 kerb / 7 gutter, profile coord in aS.x from streets.ts extrudeCurb;
  normal tilt `rdN` via materials.ts `nrm` hook, key roads-hard-v6): per-stone settle (normal tilt + tone),
  arris worn bright with chips, 12 mm joints, damp foot band, tyre scuffs; gutter wet grime line, silt, litter.
  Dropped kerbs at crossings already existed in geometry (streets.ts RAMP). ?nokerbdetail (off on low).
* Signs: STOP blank as 8-sided prism + rolled rim + grey back + 2 channel rails; street-name blades
  (signals.ts nameBlades + nameAtlas canvas, names by XS/ZS grid index; on every other signal pole and
  ~50 % of stop poles, pole extended to 3.02 m); repeater heads get a black back plate with white border.
* Lawn-wall seam: NOT groundcover/contact (persists with ?nograss, skip=groundcover, ?nocontact) — a shadow
  leak at the wall foot; cause + fix written to real-requests.md (sky.ts normalBias / W1 shell starting at y 0
  over lawn at −0.04). bench.mjs `--probe "px,py;…"` added (raycast at screen pixels → report.json).
* Groundcover request done: mask.ts `worn` raster clears blades in trees[].worn, no edge tufts there.

## Code pointers (learned; do not re-read)
* bench: scripts/bench.mjs — slot classes from `plan.slots` (lamp, tree, …), features from `plan.features`.
* Trees (card mode = default): placement `plant({... surround})` in vegetation.ts (~l.250–300 street, 375 civic,
  496 plaza); build loop vegetation.ts ~l.855 (`surround()` then `addPlant`). Surrounds (grate, roundgrate,
  kerbgrate, verge, planter, roundplanter) = plants.ts `surround()` ~l.420 (flat boxes/cyls — primitive).
  Near trunk: crowns.ts `nearTrunk()` ~l.327 (bezier 4 segs, foot r0*1.32 sunk 0.15) + `buttress()` roots.
  Bark: foliage.ts WOOD_FRAG_MAP ~l.563 — colour-only patterns by `pattern` code (0.1 furrow, 0.3 smooth,
  0.5 plane, 0.7 palm, 0.9 birch), moss north side; vThRest = rest pos (local), vThAng angle. No normal relief.
* Lamp posts geometry: src/world/props/furniture.ts `lamp(k, style, street, rng)` ~l.75 (styles modern, simple,
  suburb, beach, plaza, default classic/park) — 6-sided cyls; lamps.ts/lamps/** = light bake only.

## Done
* Bench classes for W5 (above).
* Tree bases: foliage.ts WOOD shader — bark relief (normal bump from the furrow/fissure noise gradients:
  `thBarkG`, WOOD_FRAG_NORMAL after normal_fragment_maps), soil-stained trunk foot (first ~40 cm, varying
  `vThFoot` = height above root). Knob `cardKnobs.base` (0 under ?notreebase or quality low).
* Tree grates as cast iron (plants.ts `roundGrate`/`rectGrate`): frame ring, concentric rings + radial ribs over
  dark soil, collar, mulch + leaf litter in the hole, rust on some bars, litter on the grate. All ≤ 3.2 cm proud
  of the paving (the paving is not cut). Trunk fits the hole: crowns.ts `def.paved` (= GRATE_HOLE) caps r0 and
  drops buttress roots / flare to 1.12 (no roots over the iron). Tree guards (plants.ts `treeGuard`) on 30 % of
  street trees under 8 m.
* Lamp posts (props/furniture.ts `lamp(k, style, street, rng, kf?)` — W3's file, only this function + 2 helpers):
  coarse shafts 6 → 10 sides, classic gets a ladder bar; near-only kit `kf`: classic lathe base (plinth, torus,
  panelled drum, cornice, bell) with door + keyhole, fluting ribs, collars, lantern corner bars/rails/crown;
  modern/simple/plaza/beach: bolted base flange (plate, 4 nuts+washers+studs), service hatch with lock and a pole
  number plate/sticker; suburb lathe base. Toggle ?nolampdetail (off on low).

* Hedges (vegetation/species.ts `hedge()` core + crowns.ts `hedgeStruct`): woody undercut foot (bottom ~20 cm
  inset to 70 % width, dark stems colour HEDGE_WOOD), ends rounded by 2 extra tapering rings past each end (was a
  flat slab), 10 leaf-card tips on each end, bare woody stems (near wood segs, every 22–40 cm) in the foot.
* Street tree 'verge' pits (plants.ts `vergePit`): granite sett edging, soil bed, patchy grass blobs (none within
  30 cm of the trunk), leaf litter — was a flat bright-green box.
* Bark fissure scale for the smooth pattern (0.3) more vertical (8, 1.5, 8) — at (6, 2.2, 6) it drew arcs.
* Picket fences (props/furniture.ts `picketFence(.., rng?)`, `fencePost`, `gateLeaf`): chamfered posts set 12 cm
  into the ground with pyramid caps and a soil collar, rails touching the boards (were 8 mm off = floating
  pickets), per-picket height/lean jitter, weathered paint at the foot (grey timber + algae). Garden gates in the
  front-walk gap (props.ts fence loop, from `layout.gardens[].front`): ledged-and-braced leaf with pickets, strap
  hinges, thumb latch; 45 % open into the garden.

* Kerbs (roads/surfaces.ts HM.curb/curbFace): granite units with dark 9 mm joints, per-stone tone 0.15, rounded
  arris darkening (bevel 0.14), stains; face darker. Manhole + gully-grate decals (roads/markings.ts atlas):
  legible casting ("TINYHAVEN" / "SEWER" text ring, chequer plate, pick holes; grate frame/bars/rib/lugs) embossed
  from a height field (`emboss()`, baked top-left light) — atlas context is willReadFrequently (console clean).
* Stop signs (sim/traffic/signals.ts buildStopSign, ?nosigndetail): 12-sided pole, cap, grout collar, two band
  clamps + brackets + bolts, carriage-bolt heads on the face, 35 % lean 1–2°, sticker on 45 %.

## Tried and rejected
* Gate gap found by walking `layout.walk` MASK_WALK from the fence end: front walks are not in that mask → no
  gates. Use `gardens[].front` instead.

## Toggles / tiers / costs
* ?notreebase — bark relief + foot stain off, trunks not fitted to grates, no tree guards (grates stay new).
  Low tier: shader part off.
* ?nolampdetail — no near lamp-post kit (low tier: off).
* ?nosigndetail — stop signs and signal poles as before.
* Cost (perf.mjs, software GL, eye-level downtown view "0,0,-40,12,30,12", 2 runs): all W5 toggles on vs off =
  +225–241k triangles (+6.5 %), draw calls equal (175); ms/frame within SwiftShader noise. After m3 the grates
  (16/12 ribs, fewer ring segments, no hidden rib faces) and the classic lamp lathe (12 sides) were trimmed;
  perf2 (after the trim): +214k tris (3.453 M → 3.667 M) — the grates are NOT in that delta (always on), so
  the delta is lamp near kit + fences/gates + signals + guards/worn patches; flange washers/studs then dropped
  (−~25k est.). Next: measure per toggle (`;nolampdetail`, `;nofencedetail`, `;nosigndetail`, `;notreebase`)
  and give the grates a toggle/tier if they show. Biggest remaining: grates + verge setts (~450 tris per street tree, fine
  plant sink = near chunks), classic lamp near kit (~600 tris each). Unmeasured on the Adreno.
* Session 2 (perf_s2a/b, same view): per toggle BEFORE the near cut: lamp kit +70k, fence detail −2k, sign/signal
  +86k, treebase +14k (= +181k). After the cut (props KD, signals `fine`, 12-seg base shafts): all W5 toggles
  on vs off = +59k tris (3.501 M vs 3.442 M), but +7 draw calls (184 vs 177: ≤ 4 lamp cells, 2 signal cells,
  1 street-name mesh). Grate bars/ribs/litter moved to vegetation near cells afterwards (perf_s2c).
* ?nonearcut — draw every near cell (A/B of the distance cut). ?nokerbdetail — kerb stone/gutter shader branch
  off (also on low).
* ?nofencedetail — old pickets/posts, no gates, no hedge foot stems (low tier: off). Hedge core rounding + verge
  pits are geometry replacements (always on).

## Sheets
* After s2: docs/progress/real/w5_s2_after.jpg (kerb ×2, signal back plate + name blade, STOP plate, grate, seam probe).
* Before: docs/progress/real/w5_before.jpg (treebase, lampbase, kerb, fence, hedge at 2/6 m, base commit).
* After m3: docs/progress/real/w5_m3_after.jpg (grate tree, verge tree, classic lamp base, kerb, fence + gate,
  hedge, manhole, stop sign, signal). Working shots: shots/w5/s*/ (not committed).

## Tokens (session 1, tokens.py)
203 calls, 5.4 M weighted, ctx median 222k / max 332k (over the 200k cap — next session: stop earlier),
0 cold rewrites, idle>5min 0/0. Content: system+brief 32 %, Bash reads 22 %, reminders 13 %, own output 11 %.

## Tokens (session 2, tokens.py)
130 calls, 3.0 M weighted, ctx median 195k / max 262k (over the 170k cap again: perf runs + image reads), 0 cold,
idle>5min 5/0. Content: system+brief 37.5 %, Bash reads 25 %.
