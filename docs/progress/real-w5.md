# W5 — trees (bases), ground contact, kerbs, fences, signs, lamp posts

Branch `claude/real-w5-street` (from claude/pensive-gates-bim12i @ 6c29a46). Brief: real-briefs.md "W5".

## Resume here
* Step 1 (tree bases) + step 5 (lamp posts) first pass done, commit "W5 m1". Next: judge bark relief at 3 m in
  sun (bench treebase --pick 1..3, crop the PNG — the 1280×720 sheet is too small to judge a trunk foot), park-tree
  worn-grass ring, then priority 2 kerbs (kerb class), 3 fences/hedges (hedge end = flat slab!), 4 signs.
* Bench: new classes treebase, lampbase, kerb, fence, hedge, wall, sign, signal (scripts/bench.mjs, committed
  separately). Close classes use h=1 so the 2 m capture is really ~2.4 m. Crop PNGs with PIL to judge.

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
* ?nosigndetail — stop signs as before.
* ?nofencedetail — old pickets/posts, no gates, no hedge foot stems (low tier: off). Hedge core rounding + verge
  pits are geometry replacements (always on).

## Sheets
