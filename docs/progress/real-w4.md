# W4 — People ("real things" round, wave 2)

Branch `claude/real-w4-people` (from `claude/pensive-gates-bim12i` e517126). Brief: real-briefs.md "W4".
Photo test "Person" (REAL.md). Owned: `src/sim/pedestrians/**` presentation (not crowd/places logic).

## Resume here
* 2026-10-28 — session 1. Close level (Lod 4, < 15 m high / 11 med / 7 low) built: sculpted head + ears,
  shader-painted face (`pedFacePaint`), fingers (`buildFingers`), hair strands (`pedStrands`), fabric
  (`pedFabric`: seams, knee/elbow creases from the pose bend, trouser break, denim stitching/pockets).
  Judging with `node scripts/people-bench.mjs --n 3 --out shots/w4/pbN` (face 0.75 m / hand / body 2.6 m /
  group 10 m; bench.mjs pedestrian frames ≥ 3 m so it can't judge faces). Base tree for before/after:
  worktree `../base` (e517126) on port 5174 (`--url http://127.0.0.1:5174/`).

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

## Tried and rejected (why)

## Toggles / tiers / costs

## Sheets

## Next
