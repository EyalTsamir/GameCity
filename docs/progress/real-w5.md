# W5 — trees (bases), ground contact, kerbs, fences, signs, lamp posts

Branch `claude/real-w5-street` (from claude/pensive-gates-bim12i @ 6c29a46). Brief: real-briefs.md "W5".

## Resume here
* Session 2 (lead priorities 1–6). Progress:
  1. Cost — measured per toggle (shots/w5/perf_s2a.log, eye level "0,0,-40,12,30,12"): lamp kit +70k,
     fence detail −2k (cheaper than the old boxes), sign/signal detail +86k, treebase +14k. Fix: fine
     fixings now live in 48 m world cells drawn only within ~30 m (src/world/lamps/nearCells.ts;
     props.ts `KD`, signals.ts `fine` arg of place()). Re-measure pending.
  2. Gate-frame dark rectangle = the footway utility-lid decal (markings.ts atlas 'lid': dark #8a square with
     diagonal stripes, aliasing at grazing angles). Redrawn as an embossed galvanised chequer-plate lid.
  3. Kerb: shader branch special 6 (kerb) / 7 (gutter) in roads/glsl.ts rdHard, profile coordinate in aS.x
     (streets.ts extrudeCurb), per-stone normal tilt via `rdN` (materials.ts `nrm` hook). ?nokerbdetail.
  4. Signs: rimmed STOP plate + back rails; street-name blades (signals.ts nameBlades, canvas atlas, 1 draw
     call); repeater back plates.
  5./6. in progress.

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
* ?nofencedetail — old pickets/posts, no gates, no hedge foot stems (low tier: off). Hedge core rounding + verge
  pits are geometry replacements (always on).

## Sheets
* Before: docs/progress/real/w5_before.jpg (treebase, lampbase, kerb, fence, hedge at 2/6 m, base commit).
* After m3: docs/progress/real/w5_m3_after.jpg (grate tree, verge tree, classic lamp base, kerb, fence + gate,
  hedge, manhole, stop sign, signal). Working shots: shots/w5/s*/ (not committed).

## Tokens (session 1, tokens.py)
203 calls, 5.4 M weighted, ctx median 222k / max 332k (over the 200k cap — next session: stop earlier),
0 cold rewrites, idle>5min 0/0. Content: system+brief 32 %, Bash reads 22 %, reminders 13 %, own output 11 %.
