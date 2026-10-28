# W4 — People ("real things" round, wave 2)

Branch `claude/real-w4-people` (from `claude/pensive-gates-bim12i` e517126). Brief: real-briefs.md "W4".
Photo test "Person" (REAL.md). Owned: `src/sim/pedestrians/**` presentation (not crowd/places logic).

## Resume here
* 2026-10-28 19:15 UTC — session 1 ENDED (context cap). Branch `claude/real-w4-people`, all committed + pushed.
  Brief priorities 1 (faces/hair), 2 (fingers), 3 (fabric, shoes), 6 (vendor request) done at a new **close
  level** (Lod 4, < 15 m); 4 (walk weight) was already strong (gfx-people) — not touched; 5 (carried things):
  straps + paper shopping bag at close; 7 (variation): per-person face shape, eye colour, lipstick, stubble,
  age lines.
* Not yet verified on the bench: the last three commits — skirt panel drape (shader.ts TAIL block), paper
  shopping bag (`shoppingBag`), vendor facing (crowd.ts stepVendor). First thing next session:
  `node scripts/people-bench.mjs --n 4 --skip 1 --out shots/w4/pb8` and `node scripts/bench.mjs --classes
  marketstall --dists 3 --out shots/w4/market2`.
* Perf: `shots/w4/perf2.log` (view `27,0,17,20,30,18`, variants `;pedlod=0;pedlod=close` = every figure
  forced to near vs close: upper bound). Result: see "Toggles / tiers / costs" (filled if the run finished).
* Sheets: docs/progress/real/w4_before.jpg (bench.mjs, ≥ 3 m), w4_after_faces.jpg, w4_after_bodies.jpg
  (people-bench), w4_market_vendor_before_fix.jpg. Overview untouched (close level only < 15 m; hair strands
  fade by fwidth) — downtown shot: console clean, invariants 0 (shots/w4/dt.json).

## Code pointers (so the next session needn't re-read)
* body.ts: `LODS` per level (0 near <40 m, 1 lo, 2 tiny, 3 pin, **4 close** <15 m, new); `REG` regions (+FACE 21),
  `FB` feature bits; `MeshBuilder.v(p, h, w, a1, a2)` packs bone|region|feature|tint (d0), hem h + parent weight
  (d1), aux a1/a2 (fx16 ±8, 1/4096). Head: `buildNeckHead` (rings d.headRings from rig.ts, eye line = ring 4,
  `torsoPoint(r,0,phi,2.1)`), close: `buildCloseHead` + `faceRelief(X,Y)` (sculpt, man-head metres) + ears.
  Hands: `buildArm` (hand 'fingers'|'full'|'paddle'|'none'); close: `buildFingers` (aux1 = grip curl share).
* shader.ts: VS `pedPose()` — morph, garments, grip curl (`aux.x` on HAND bones, pivot = wrist–tip midpoint,
  pedRZ), FK, colours per region → vPedA/vPedB + boundary vPedS (hem), FS `FRAG_COLOR` mixes; `LAMBERT_PEOPLE`
  (wrap / sheen per region via vPedMat). New: varyings vPedFace (X,Y,1 on FACE), vPedFB (face bits), vPedHairW;
  `pedFacePaint()` in FRAG_PARS.
* render.ts: `lookData()` packs 12 colour words (`col[11]` bits 9–14 = face bits from `faceBits()`); `Layer` per
  level; `CrowdRenderer.levels = [close, near, far, tiny, pin]`, `closeDist` (quality tier), `forceLod` index into
  levels. pedestrians.ts: `?pedlod=0..3` (old meaning) / `?pedlod=close`, `?nopeopledetail`.
* rig.ts: `Dims` per target (man/woman/child/heavy), `bodyParams()` → w,c,b,s,old.

## Done
* Close level (Lod 4): 44-side head with a sculpted face (`faceRelief`: sockets, lids, brow ridge, nose with
  bridge/tip/wings, cheekbones, lips, chin) + jaw taper + shell ears; painted eyes (almond, sclera, iris by face
  bits, pupil, glint, lash line, crease), brows (hair colour), lips (lipstick bit), nostrils, age lines (age bits),
  stubble (bit). Fingers: 4 jointed fingers with a relaxed curl + grip curl share, jointed thumb, pale nails.
  pb2 (shots/w4/pb2/sheet.png): eyes, brows, nostrils, ears, fingers read at 0.75–1 m equivalent.
* Hair strands (all levels, octaves fade by fwidth); hair sheen 0.07→0.03 (read as a bald spot on top).
* Fabric (close): seams, denim twin stitching + back/front pockets + yoke, knee/elbow creases ∝ pose bend,
  trouser break, sleeve cuff gathers, torso side seams / waist folds, coat/skirt drape, weave grain.
* Close level also: rounded shoulder line (Catmull-Rom torso rings ≥ 8), straps as webbing ribbons hugging the
  torso (`strapPath`), 24-side hats with brim underside, beard + moustache on the sculpted face
  (`buildCloseBeard`, `closeHeadPoint`), per-person face shape in the VS (nose / chin / cheeks / lips from a
  hash of the colour words), hair strand relief in the normal (`HAIR_NORMAL`).
* Market vendor (W3 request): faces the aisle again when the clock is not in the packing window
  (crowd.ts stepVendor; it kept the packing "toBack" yaw after a clock jump — bench sets 11 h after load).
* Shoes (close): welt / midsole line, laces, tongue gap, toe-cap and heel seams (aux u/v on the foot loft).

## Tried and rejected (why)
* bench.mjs `pedestrian` for faces: its arm is ≥ 3 m and it frames the body middle → faces 25 px. Replaced by
  people-bench.mjs. The free camera stops at 3 m (camera.ts FREE_MIN_DIST): the bench narrows the fov instead
  (LOD distances scale with the fov, so the close level is chosen as for a real 0.75 m view).
* Hats at the close level fell to the 6-side lo hat (head poked through, black holes) → 24 sides.
* Straight strap sticks vanished into the rounder 20-side torso → `strapPath` hugs the surface.
* Face detail fade at px 3.5–9 mm: eyes vanished at 3–4 m (where real eyes still read) → 6–16 mm.

## Toggles / tiers / costs
* `?nopeopledetail` — no close level (figures < 15 m use the old LOD0). Tier: close level to 15 m (high),
  11 m (medium), 7 m (low) — `CrowdRenderer.closeDist` set in pedestrians.ts.
* `?pedlod=close` forces every figure to the close level (`?pedlod=0..3` = near/lo/tiny/pin as before).
* Stats: `pedestrians.closeLod` = figures drawn at the close level. Capacity 48 (overflow → near).
* Cost: TODO perf.mjs `;nopeopledetail` at a people-dense view (square `27,0,17,20,30,18`).

## Sheets

## Next
* Skirts/dresses in a long stride split into a pointed diamond at the front hem (thigh-carried skirt rings;
  pre-existing at LOD0, more visible at close) — blend front/back vertices towards the mean of both thighs.
* T-shirt neckline zig-zags at the close level (neck rings 3 × 16; the hem boundary crosses the torso top cap).
* Carried things at close: shopping bag is a soft box (paper bag with handles / plastic bag), phone, cup.
* Moustache still a bar: taper ends, strand paint.
* Dark-skin faces: sclera could read a touch bright; check at 11 h and 18 h.
* Perf: measure `;nopeopledetail` on the target (software GL here).
