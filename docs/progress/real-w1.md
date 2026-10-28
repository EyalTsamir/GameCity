# W1 — Facades (real-things round)

Branch `claude/real-w1-facades` (from `claude/pensive-gates-bim12i`). Brief: docs/progress/real-briefs.md "W1".

## Resume here
* 16:10 UTC — WIP committed (a worker restart killed the dev server; restart it per real-briefs). Coded so far in
  `buildings/materials.ts` + `gen.ts`: window reveal/sill parallax, wall relief, plinth, roof tile relief, doors
  (4 joinery types, lever + escutcheon, letter plate, kick plate, bell, legible house number above the door),
  eave gutters + downpipes from `gableRoof`/`hipRoof`. Bench s5 (house/townhouse front, 2.5/12 m) running to judge
  doors + gutters. Then: `?validate` (downpipe footprint check), overview shot, night regression, perf variants.
* Debug: `?bdbg=reveal` colours reveal hits (red jamb, green head, blue inner sill, yellow sill box).

## Done
* **Window depth (shader parallax, `?nowinreveal`, medium/high: needs uDetail ≥ 0.5)** — in `bhWall`, per window
  cell: the view ray is traced into a reveal (14 cm houses, 10 cm industrial, 9 cm shop, 7 cm doors, 6 cm ribbon,
  0 curtain walls): jambs / head / inner sill hits get the wall surface with depth AO and their own normal
  (`bhNW`, a world-space normal override injected after `normal_fragment_maps`); otherwise the glass point moves to
  the back of the reveal (frame, panes, curtains and the interior mapping shift with the view). A stone sill box
  (6.5 cm thick, 6 cm proud, 5 cm past the jambs, drip groove underneath) is ray-traced in front of the wall for
  window styles PLAIN / MUNTIN / INDUSTRIAL / ARCHED (not on corrugated walls; metal-ish on panel/smooth walls).
  Sun shading: the reveal shades the glass and jambs, the sill shades the wall below (albedo × 0.45–0.5 · daylight).
  Fades with the cell's pixel size (px 0.05–0.2) before the far-field LOD.
* **Wall relief (`?nowallrelief`, medium/high)** — `bhWallSlope` → normal: brick joints (real 215×65 mm bricks,
  10 mm joints, stretcher / Flemish / English bond per building, burnt headers on some Flemish walls, chipped
  arrises, per-brick tilt), ashlar chamfers + pillowed faces, panel joints, lap-board lean, corrugation ribs,
  render trowel undulation + grit. Each fades out where unresolved.

## Tried and rejected
* Assuming window-cell u runs along the shader tangent T: wrong for some walls → u direction now from screen
  derivatives (`uSign`). (The first "jamb on the wrong side" reading was the bench camera standing to the right.)
* Reveal returns using the wall pattern at the wall coordinates: the bricks ran on across the arris, no corner
  read → pattern turned 90° on the returns + depth AO, frame contact line, pale worn arris.

## Toggles / tiers / costs
* `?nowinreveal` (uWinDepth), `?nowallrelief` (uWallRelief, also roof tile relief), `?noplinth` (uPlinth); shader
  features off on `quality=low` (uDetail 0.4).
* `?nodoorlife` (house numbers + bells), `?nogutters` (eave gutters + roof-builder downpipes). Geometry, all tiers.

## Sheets
* base: shots/w1/base/sheet_1.png
