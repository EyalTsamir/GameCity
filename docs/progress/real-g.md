# Last fix round (G1–G3) — shared log

## G2 — Ground, track, water (branch claude/real-g2-ground)
### Resume here
* 11:37 UTC FINAL (time-box). Colonnade dots also survive uRdWear=0 (shots/g2/cmp5.png) → they come from the base
  slab pattern in the joint/edge branch of glsl.ts ~l.340–400 (joint rdLine / chamfer darkening / per-stone rdN
  tilt `rdN = … * 0.06 * hd`) on the plaza:2 forecourt slabs (frame 1) in the shaded arcade. Next session: A/B
  that block (set rdN = 0, then hd = 0) at office 3 m with shots/g2/probe.mjs (one load, `~`-separated variants;
  roads materials expose userData.rdUniforms), and widen the joint filter (rdLine width vs fq) if it is the joint.
* 11:33 UTC checks: typecheck clean; downtown shot invariants {} + console clean; golden vs base worktree (port
  5174, 1280×720, 11 h): overview 0.0, downtown 0.02. Colonnade dots: hide:roads-hardscape removes them (arcade
  floor is plain) → they ARE in the hardscape shader, not litter (A/B with uRdWear=0 → shots/g2/p10).
* 11:18 UTC: pushed fountain + ballast (judged, sheet docs/progress/real/g2_fountain_ballast.jpg), straight slabs
  (judged office 3/10 m), litter max-footprint + arcade floor 0.005 (NOT effective on the colonnade dots — see
  Findings). Golden overview/downtown vs base worktree (port 5174) running → shots/g2/gold_{base,now}.
* 11:00 UTC: pushed straight-slab fix; in flight (uncommitted until judged): litter footprint fix (glsl.ts rdLitter),
  arcade floor 0.02→0.005 (buildings/towers.ts, harmless, kept), fountain jets/pool (?nofountainfx), ballast bed
  relief (?nobedrelief). Captures: shots/g2/{b1 (ballast+fountain), p6 (office 3 m)}.
* 10:25 UTC start. Base = claude/pensive-gates-bim12i @ 2dac266. Order: downtown pavement (judge 3 #2) → ballast/
  cutting (#6) → fountain (#5) → church gablet rod.
### Findings
* UPDATE 11:15: the litter fix did NOT remove the dotted rows under the Café Nord arcade (office 3 m, cmp
  shots/g2/cmp3.png) — so the cause below is wrong for that frame (litter fade kept: harmless hygiene, may still be
  the judge's "barcode" in the tree 3 m frame — unverified). Still to try: probe with hide:roads-hardscape
  (shots/g2/q8.sh) — if the dots vanish they are in the hardscape joint/edge shading (plaza:2 forecourt slabs,
  frame 1), else in buildings (shopfront base / arcade floor).
* Judge 3 #2 "dashed acne line along every colonnade" + "barcode": NOT shadow acne, NOT hand-laid paving, NOT
  groundcover (probe hide:groundcover keeps it; noshadow hides it only because it brightens the arcade). It is the
  hardscape litter (`rdLitter`, glsl.ts): 5 mm cigarette butts / gum faded by the geometric-mean pixel footprint,
  which at grazing views is far smaller than the long axis → sub-pixel items alias into rows of dark dashes, densest
  in the wall band (lat 5.9–6.5) = along every frontage and under arcades. Fix: fade by the larger footprint axis.
* Wavy joints: F3 hand-laid course wander (±0.25 × course height) also applied to 0.6–1.2 m sawn slabs.
* The arcade floor (towers.ts, y 0.02) is coplanar with the block paving (Y.cover 0.02) — ray picks hit both at the
  same distance; moved to 0.005 (under the paving).
### Code pointers
* Paving shader: `src/world/roads/glsl.ts` ~l.340–420 (hand-laid courses: `hand`, `qy` wander, jittered joints;
  uniform `uRdHand` ← `?nohandlaid` in `roads/materials.ts:431`).
### Done
* Straight courses on sawn slabs: hand-laid wander/jittered lengths only for units < 0.35 m (setts, pavers);
  per-stone tone/tilt (hd) unchanged for < 1.3 m. Office 3/10 m: joints straight, no wavy lines.
* Fountain (?nofountainfx, all tiers — a few ALU on small surfaces): jets = aerated water (dense streaky core,
  feathered edges instead of a bright fresnel rim, tearing + fading before landing); drops small and soft (were
  white beads); pool = shallow water over a pale stone floor with moving caustics, deep teal in the middle, extra
  wind chop, roughness 0.06→0.1. Judged at fountain 3 m: no longer flat cyan / glass tubes.
* Ballast bed (?nobedrelief, all tiers; ≈ +14 tris/m of track): cross-section profile instead of a flat top —
  cribs 4–5 cm below the sleeper tops (sleeper sides show), shoulders heaped 2 cm over the sleeper ends, rolling
  off to the slope; per-vertex jitter ±1.1 cm every 0.33 m; shoulders stepped with the top (no cracks). Ballast 3 m
  judged: sleepers now sit IN the bed. Stone texture itself (voronoi) unchanged.
### Tried and rejected
### Open (not done)
* Colonnade dotted rows (cause unidentified, see Findings), cutting slab ledges (#6), church gablet rod
  (landmarks/church.ts ~l.84–118: the two raking roofFace slabs are symmetric in code — the rod may be another part;
  needs a ray pick at the judge view), ballast stone relief (still a flat voronoi texture).
### Toggles / tiers
* ?nofountainfx, ?nobedrelief (all tiers). Debug handle: roads materials expose `material.userData.rdUniforms`
  (lets one page load A/B uRdHand / uRdWear).
