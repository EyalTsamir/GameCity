# Wave-1 judge (fresh eyes) — 2026-10-28

Scope: everything merged on `claude/pensive-gates-bim12i` @ df7a5cf (W1 facades m3, W2 vehicles m3, W3 furniture s3).
Judged **against the REAL.md photo tests**, not against "before". Workers' logs read only after judging, to drop
items already listed as open/planned (marked *known*).

Verdict scale: **real** = passes the photo test at 3 m and 10 m · **almost** = one or two missing things ·
**not yet** = still reads as a model/primitive at 3 m.

## Captures (all 11 h unless noted; 1280×720, software GL; console clean, 0 page/frame errors, 0 failed modules, no missing classes)
| set | contents | path |
|---|---|---|
| a | house, townhouse, apartment, office, shop @ 3/10 m | shots/judge/a/sheet_1.png → **docs/progress/real/judge1_facades.jpg** |
| b | tower, warehouse, factory, church, school @ 3/10 m | shots/judge/b/sheet_1.png → **judge1_civic_industry.jpg** |
| v0/v1/v2 | car, bus @ 3/10 m, yaw 0/150, picks 0,1,2 | shots/judge/v{0,1,2}/sheet_1.png → **judge1_vehicles.jpg** (= v1) |
| c | bin, planter, newsstand, phonebox, statue | shots/judge/c/sheet_1.png → **judge1_furniture.jpg** |
| d | gazebo, kiosk, marketstall, playground, picnic, flagpole / bench, bikerack | shots/judge/d/sheet_{1,2}.png → **judge1_park_market.jpg** (= sheet 1) |
| free | old town (82,3,−4), Westbrook (−137,3,51), downtown (−8,6,−80), avenue (0,4,−40), overview, downtown 21.5 h | shots/judge/free/*.png → **judge1_street.jpg** (old town, Westbrook / downtown 11 h, 21.5 h) |

Before: docs/progress/real/audit_1..6.jpg.

## Ranked findings (impact = how often it is on screen × how hard it breaks the illusion)

1. **Cars still read as clean plastic toys at 3 m (vehicles: almost → not yet on paint/form).** Big step up
   (panel gaps, handles, wipers, mirrors, plates, visible seats/driver, alloy rims), but: (a) the body sides are
   flat slabs with no crease/shoulder line and no curvature in plan — the white sedan at 3 m (v0 car_3m) is a
   uniformly lit box side; (b) paint has no clear-coat reflection of the street/sky — it is matte-satin, the single
   biggest "toy" cue; (c) mirror = black box + pale ball, reads as a stuck-on part; (d) parked rows are the same
   sedan silhouette ×4 in different colours (v0 car_10m) — "no two parked cars identical" fails at 10 m;
   (e) no dust/dirt on the lower body or sills, tyres clean black. Lorry cargo (v2): crates are soft-edged
   pillows without slats/straps/pallets (*known: no pallets*).
2. **Bus: almost.** Side is good (framed windows with seals, poles, seated passengers, destination display,
   mirror on arm). Defects: roof units are soft "pillows" with no grilles/edges (dominant at every elevated view,
   which is how most players see buses); front is a flat white face — no bumper in a different finish, no grille,
   no visible wipers at 10 m; no dirt spray behind wheels (*known*). Bench framing for bus at 3 m looks down on
   the roof only (bus_3m both yaws) — the front/door test was not visible: fix framing (lower pitch, front yaw).
3. **Facades — house/townhouse: almost; apartment: almost; office/tower: almost; school/church: not yet.**
   Brick coursing, plinth band, sills, muntins, curtains/blinds, precast joints, rivulets, clad columns all
   read now. Remaining, in order:
   - Windows still sit **flush**: at an oblique 3 m view (house_3m, westbrook) no reveal shadow on the frame's
     sun side; frames are uniform white 2-D outlines. The reveal is the #1 photo-test cue and is not visible yet.
   - **Glass is the same grey on every pane** per building (downtown free view: 60 identical panes with
     identical blinds) — no per-pane reflection variance, no open/half-closed blinds mix, no dark (unlit,
     curtain-less) rooms. Repetition is the tell at 10–20 m.
   - **Townhouse painted walls (lavender/green) read as flat paint on plastic**; shutters are flat slabs (no
     louvres); awnings are flat stripe planes (no valance/scallop, no sag); shop fascia signs flat.
   - **Lawn-to-wall seam**: a bright yellow-green rim line runs along the foot of the apartment and house walls
     (apartment_3m, house_3m) — looks like a lit edge of the grass layer, the opposite of the dark/damp band the
     contact test wants. Very visible at 3 m.
   - Old-town render (market backdrop at 3 m) has an over-coarse "popcorn" trowel relief — too strong at 3 m.
   - **School and church unchanged** vs audit: flat white window grids, flat sign board, church door flush in the
     arch with no hinges/ironwork/step, no plinth on the church stone.
   - Door: house number + handle present; no letterbox, no bell/lamp, porch step missing (*known: footprint*).
   - Tower ground floor: no entrance canopy / intercom / mailboxes (photo test); upper curtain wall flat blue.
4. **Industrial (warehouse/factory): not yet.** Bollards at doors added (good). Roller doors are still flat
   colour panels with painted black squares; no guide rails in depth, no bottom rubber, no kick plates/dents;
   corrugated cladding reads as stripes without depth at 3 m.
5. **Newsstand: not yet.** Magazines are blank colour rectangles (no covers/mastheads/text); roof is two stacked
   slabs with a gap that reads floating; no shutter, no sign, no vendor/hatch.
6. **Market stall: almost — best object of the wave.** Individual fruit, slatted crates, draped cloth with folds,
   chalk price tags, scale, stallholder. Defects: fruit piles are perfect pyramids of identical spheres
   (size/colour/rotation jitter missing); scale is a white block; backdrop curtain is a flat purple plane; no
   ground clutter (cardboard, hand truck) at 3 m.
7. **Statue: almost.** Inscribed bronze plaque on the plinth is convincing; plinth steps are clean CG boxes with no
   moulding at the cap, no weathering streaks visible at 3 m (*known: streaks*); figure only seen at 10 m (reads as
   a figure now).
8. **Phone box: almost.** Glazing bars in relief, crown, handle. Panes uniformly lit; no interior phone visible
   at 3 m; paint without chips.
9. **Bin: almost.** Base plate with bolts, door, slot, sticker. Lid is a flat pale slab with no rim/lip; no liner
   edge; grime at the foot too faint.
10. **Planter: almost.** Timber/rusty box with trailing plants — good. Soil not visible, no drainage stains.
11. **Gazebo: almost.** Turned columns, planks, benches. Roof underside flat; rails too clean/new.
12. **Kiosk: not yet.** Green box with white board panels, flat striped awning, counter with three props.
13. **Playground: not yet.** Swing/frames are coloured sticks without fittings, chains or wear; safety surface
    a flat red patch; carousel a flat disc.
14. **Picnic table: almost** (form right; boards too clean, no grain). **Bench: real/almost** (fixings OK).
    **Bike rack: real** (unchanged). **Flagpole: almost** (base plate + bolts; halyard/cleat not visible at 3 m).

## Cross-cutting
* **Repetition** is now the main tell, more than primitiveness: identical windows/blinds across a facade,
  identical car silhouettes in a parking row, identical fruit spheres. Every class needs per-instance jitter.
* **Contact**: props have foot grime on themselves, but nothing on the ground around them (*known W3 #4*); the
  lawn/wall seam is *brighter* instead of darker (see 3). Trees still meet paving cleanly (wave 2).
* **Material consistency**: wear/rivulets are strong on precast and render, absent on painted townhouse walls,
  vehicles, playground, kiosk — so new and old objects sit side by side at different "ages".
* **Floating white specks** (`world/life/drift.ts` motes) read as dead pixels / lens dust in every daylight frame
  at 3–20 m (house_3m, bus/avenue views). Not this wave's code, but it costs realism everywhere; tone down
  (smaller, fewer, depth-faded) or restrict to backlit views.
* **Smoke** from Westbrook chimneys = grey cotton puffs detached in the sky (free/westbrook) — out of scope
  (ambient), noting for the lead.
* **Scale**: OK overall. Newsstand roof slab and bus roof units look oversized.
* **Overview**: intact — no regressions seen (free/overview).
* **Night (21.5 h downtown)**: no regression from the new glass; lit windows read. Small warm squares inside
  dark office windows read as stickers; lamp heads have large white bloom balls at close range (pre-existing).
* **Bench framing**: tower 3 m blocked by a parked van; bin 10 m blocked by a bus shelter; bus 3 m only shows
  the roof. Fix before the next judge.

## Regressions
None found against audit_1..6 (overview, night, console, invariants all fine). The only *new* visual faults are
the bright lawn/wall rim line (if introduced by the plinth/contact work) and the newsstand's floating roof slab.

## Verdict table
| class | verdict | top defect |
|---|---|---|
| house | almost | flush windows (no reveal shadow), bright lawn rim at wall |
| townhouse | almost | flat painted walls, flat shutters/awnings |
| apartment | almost | identical glass/blinds, lawn rim line |
| office / shop | almost | uniform panes, flat fascia |
| tower | almost | no entrance canopy/intercom; flat curtain wall |
| warehouse / factory | not yet | flat roller doors, no depth |
| church | not yet | untouched: flush door, no hinges/step/plinth |
| school | not yet | untouched: flat window grids, flat sign |
| car | almost (form) / not yet (paint) | no clear-coat reflection, flat sides, identical silhouettes |
| van / lorry | almost | pillow crates, no straps/pallets |
| bus | almost | pillow roof units, flat front |
| bin | almost | flat lid, no ground grime |
| planter | almost | no soil / stains |
| newsstand | not yet | blank magazines, floating roof |
| phone box | almost | no interior phone, uniform panes |
| statue | almost | plinth without mouldings/weathering |
| flagpole | almost | halyard/cleat not visible |
| market stall | almost | perfect fruit pyramids |
| gazebo | almost | clean/new, flat roof soffit |
| kiosk | not yet | box with flat awning |
| playground | not yet | coloured sticks |
| picnic | almost | no wood grain |
| bench / bike rack | real | — |
