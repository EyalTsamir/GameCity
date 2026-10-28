# W4 — People ("real things" round, wave 2)

Branch `claude/real-w4-people` (from `claude/pensive-gates-bim12i` e517126). Brief: real-briefs.md "W4".
Photo test "Person" (REAL.md). Owned: `src/sim/pedestrians/**` presentation (not crowd/places logic).

## Resume here
* 2026-10-28 ~22:15 UTC — session 5 ENDED (context ~197k). All pushed. Downtown: console clean, invariants {}
  (shots/w4/dt5b.txt). Sheet docs/progress/real/w4_after_s5.jpg (eyes before|after, dark long hair, trousers +
  knit at 1 m). Next: (a) trousers still fairly smooth at 2 m — stronger drape folds in form (VS) rather than
  shade; collar band (8-side flat ring) needs points + roll; (b) long hair mid-sheet still dark-flat in shade:
  sheen shows only in direct light — consider a faint sky-lit sheen lobe; (c) check the jog-crouch group
  (below); (d) hat crown reads pointy/pentagonal from behind (s5h p0_headback); (e) idle: café/bench sitters'
  gestures + glances at passers-by (head turns are random, not targeted).
* 2026-10-28 ~22:10 UTC — session 5 STARTED from pensive-gates b087c4b. Lead's s4 verdict priorities:
  (1) sclera too bright on dark skin (off-white, lid shadow, smaller), (2) long hair = black plaster sheet (sheen
  bands, separated locks at the ends, thinning edges), (3) FACE-edge tone line + judge fringe, (4) clothing at 2 m
  plastic (fabric roughness/micro-texture, collar/placket depth, pockets), (5) idle people (weight shift,
  gestures, head turns). Baseline: shots/w4/s5a (dark-skin faces), shots/w4/s5h (long hair).
  Done (all shader.ts unless noted; judged s5b faces, s5i/s5j long hair, s5k clothes):
  (1) Eyes (pedFacePaint): opening 5.4/3.4 → 4.7/3.0 mm, iris r 5.2 → 5.7 mm (upper lid covers its top),
      sclera off-white (0.66,0.62,0.56) mixed 22 % with the skin tone, × 0.82 recess, upper-lid shadow (−60 %
      over 4.8 mm), lower-lid shade, glint 0.35 → 0.22. Compare shots/w4/s5_eyecmp.png (before | after).
  (2) Hair: Kajiya-Kay two-lobe sheen in LAMBERT_PEOPLE (pedHairT = strand tangent from the gradient of the
      flow's along-strand coord in HAIR_NORMAL, pedHairSh = per-lock shift) replacing the Blinn hair sheen;
      primary 0.035 white, secondary 0.05 hair-tinted. Long sheet: VS passes vPedFace = (tip dist, |angle|, 5)
      (z 5 = sheet; |a| — signed a gave a discard strip down the ±π back seam); FS "LONG HAIR ENDS" discards per
      lock: triangular lock profile + own length per lock + fine straggle over the last 6 cm, front edges thin
      out (|a| < 1.45), tips a little lighter; fades out with fwidth. Hair-cap lumps/crown lift off under hats
      (they poked through caps as black blotches).
  (3) FACE-edge: face paint now fades across the boundary triangle row (F = vPedFace.xy / z, mix by z);
      stubble ends above the under-chin boundary. Not seen as a line in s5b/s5i 3/4 views.
  (4) Fabric: pedFabric writes pedFabH (fold/seam shade → height, + weave: denim twill, rib knit on ~1/3 of
      tops by a per-person hash, jersey courses elsewhere) and pedFabK; FABRIC_NORMAL = derivative bump;
      LAMBERT fuzz rim (Lambert × (1−N·V)³ × 0.9) on cloth. Front pocket openings on every trouser cut, back
      welt pockets + button on non-denim, shirt placket + buttons + collar shadow (vPedFB bit 64 = collar
      from col[11] bit 8), jacket flap pockets (vPedFB bit 128 = jacket, set in the VS colour block).
  (5) Idle (animate.ts): weight shift = tanh-saturated wave (holds on one leg, shifts over in ~1 s), rate per
      person. Head turns (crowd.ts headGoal) and TALK gestures already existed.
  Open: s5i p0_body shows a 3-person group in a deep jog crouch where the baseline s5h p0_body walked —
  s5 touched no gait code (bench timing / catch-up speed spike?) — worth a `--vel` check.
* 2026-10-28 ~21:50 UTC — session 4 ENDED. All pushed. Downtown shot: console clean, invariants {}
  (shots/w4/dt4.txt). Sheet docs/progress/real/w4_after_s4.jpg (frames predate the last two commits:
  close fringe + clump breaks — judge those first: `node scripts/people-bench.mjs --n 4 --skip 1 --shots
  face,head3q,profile --where "m.look.style.fringe"`). Next: fringe judge; faint FACE/SKIN boundary still
  visible as a faint tone line on some 3/4 views (face paint / per-person face displacement stop at the
  region edge — fade them by vPedFace.x near the boundary); walk weight judged only on 2 side frames
  (s4e) — a heavy-build walker side-by-side with a slim one would show the new terms; perf of the denser
  close head on the target.
* 2026-10-28 ~21:35 UTC — session 4. Lead's s3 verdict priorities and what was done (judged on people-bench
  shots/w4/s4a (before) → s4b/s4c/s4d/s4e; new bench shots `profile` (side of the head) and `headlow`):
  (1) Head form (close level, body.ts buildCloseHead/closeHeadPoint/faceRelief):
      - jaw: the old flat chin cap fan + 0.88/0.8 tint band made a hard jaw line → 4 under-jaw rings roll the
        jaw edge round and tuck it into the neck at the front (closes into a bowl at the back — an open
        under-surface there showed the sky through the neck top behind the jaw angle); tint gradient.
      - lower-face narrowing: cos^1.4 × 0.3 → smooth bell exp(-(φ/0.85)²) × 0.15 + a gonion flare at the
        jaw angle; cheek fullness round the mouth, shallower hollow under the cheekbone, zygomatic arch.
      - 56 sides (bunching 0.74), rows 1.8 mm through nose base + lips (3 mm elsewhere): nostrils, alar
        groove, nasolabial fold, cupid's bow / vermilion ridge, recessed mouth corners now exist in form.
      - LIGHTING CREASE root cause: FACE region wrap 0.16 vs head SKIN 0.35 → a step line temple→jaw in
        3/4 views. Now the head's wrap blends by rest normal z (shader.ts vPedMat headWrap).
      - relief fade round the head wider (sstep(-0.1, 0.45, cos φ)); neck rings deeper at the throat (rig.ts).
  (2) Hair: close cap 24 → 40 sides, 14 rings, smooth Catmull head profile for hair + hats (body.ts
      `smoothHead` flag in headSurface) — the hexagonal block was the 24-side cap on the linear ring polygon.
      Strands follow a flow field on the cap: radiate from a crown whorl (per-person side offset), swirl
      round it (shader.ts pedHairFlow); strand normal = screen-space derivative bump (fine strands + clumps
      that break along their length). Long-hair sheet: starts up on the cap (no ledge at the cap edge),
      uneven tips, locks rippling in/out with volume as they fall (normals follow), lifted rows tuck in
      under the hem. Ponytail sheet ledge beside the ear = a 2 cm hairLen sheet → sheet only for > 3 cm
      (render.ts). Close ponytail (band, lobed locks, uneven tip), coiled bun (`coilBun`), close fringe
      (16 columns, curved, jagged tips).
  (3) Walk weight (gait.ts): build/sex terms — heavy: wider base, more sway (waddle), less pelvic yaw,
      less arm swing, arms abducted; women: more pelvic yaw + list, narrower line; men more chest twist.
  (4) Variation (looks.ts): per-person shade of top/bottom/shoes/hair/skin (`shade`, suits stay matched);
      girth spread + a heavy tail (~1 in 6 adults). people-bench group shot now frames the densest cluster
      from a yaw with a clear 10 m sight line (was a shop window).
  (5) Forearm/shin stripes = pedFabric sleeve cuff-gathers / crease rings / knee + break rings applied on
      the bare-skin side of the sleeve / trouser hem. Masked to the garment side (s > 0). Judged s4d hand: clean.
* 2026-10-28 ~21:00 UTC — session 3 ENDED (context 223k). All pushed. Next: (5) walk-weight judging pass, (6) crowd
  variation at 10 m (fix the bench's group framing first), hair volume on long-hair sheets + ear poking through.
* 2026-10-28 ~20:30 UTC — session 3. Lead's priorities: (1) speed-spike root cause, (2) hairline/volume, (3) dress
  hem notch, (4) carried things, (5) walk weight, (6) crowd variation at 10 m.
  (1) ROOT CAUSE found + fixed at the source (new `scripts/ped-velocity.mjs`: drives `crowd.update` at a fixed
      step with the clock paused, patches `moveMember` → raw d/h + smoothed m.speed histograms, spikes grouped by
      cause with call site). Baseline 60 s @ speed 4: 100 % of spikes in `placeOnRail` (walk): (a) lateral offsets
      used the rail polyline's per-segment tangent → at every vertex of a rounded corner an abreast member jumped by
      lateral × turn angle (4–11 m/s); (b) offset slots sweeping round tight corners / formation (file) shuffles /
      joining the rail from a seat or queue snapped up to 0.7 m per step (10–22 m/s).
      Fix: rail.ts `RailSample.sx/sz` = tangent smoothed across vertices (TAN_BLEND 0.6 m), used by every
      member-lateral normal in crowd.ts; placeOnRail clamps a present member's step to ≤ (1.3·p.v + 0.3) m/s
      (≥ 0.6) — it lags and catches up instead of teleporting (jumps ≥ 3 m = deliberate relocations, pass).
      Result, 240 s @ speed 4 (shots/w4/velD60.txt / velD8.txt; baseline velA 60 s): smoothed m.speed (what the
      gait sees) > 3.5 m/s: baseline ~0.3 ‰ of member-steps, 7.6 m/s max in 60 s → after: 5 steps in 240 s at 60 fps
      steps (2 rare ≥ 3 m relocations, threshold since raised to 6 m), 0 at 8 fps steps (max 2.84 = jogger pace).
      Raw slot spikes left: only members not yet present (fading in) — invisible. GAIT_VMAX cap kept as a backstop.
  (2) Hairline: cap vertices carry s (aux2: 0 hairline … 1 crown) → VS lumps (locks) in the silhouette + crown lift,
      FS `HAIRLINE` feathers the first ~17 % of the cap into the skin with two strand-noise octaves and a root
      shadow (new flat varying vPedSkin). Toggle `?nohairline` (uniform uPedHairline). Judged hl2 (shots/w4/hl2):
      forehead edge breaks into strands; still somewhat cap-like at 0.8 m — next: more volume on long hair sheets,
      the ear poking through the long-hair side band (woman 67 hl2).
  (3) Dress notch = the forward thigh passing through the upper front of long dresses (skin wedge mid-thigh,
      shots/w4/cr1 man 64 body): skirt k is small high up. Fix in the TAIL block: front panel z ≥ forward leg's
      posed z, back ≤ rear leg's (cover by |rad0.y|). Judged shots/w4/dr1: grey/blue dresses + long skirts closed in a stride.
  (4) Carried things (close level): umbrella with 8 ribs, domed + scalloped canopy, lining with ribs and stretchers,
      crook handle, ferrule (`umbrellaClose`); takeaway cup with sleeve + lid rim (14 sides); briefcase arched
      handle, lid seam, catches; cross-body bag flap + buckle. Judged shots/w4/cr1: crook + briefcase read.
  Downtown shot after all changes: console clean, invariants {} (shots/w4/dt3.txt).
  Bench: people-bench `--carry 1`, `--rain 0.8`, `--where "<js on m>"`, shots head3q / headback.
  Not done this session: (5) walk weight (gait.ts already has heel strike / pelvis list+sway / chest counter-twist /
  age terms — needs a judging pass, not code), (6) crowd variation at 10 m (the bench's "group 10 m" framing hit a
  shop window in hl1 — fix framing first).
* 2026-10-28 ~20:00 UTC — session 2 ENDED (context 194k at the first get_session: the hidden system+brief is
  most of it — next session: get_session after the FIRST bench). All committed + pushed.
  Lead's m1 blockers, status:
  (1) FROG SQUAT — root cause found and FIXED, not a close-LOD bug: close and near pose identically on the same
      figure + frame (shots/w4/cmp1). The crowd's member speed spikes on position corrections (catch-ups after a
      time jump / formation shuffles: m.speed 8.78 m/s seen on a 2.55 m/s party) fed the run gait, which drops
      the pelvis into a knees-out squat above ~3 m/s; the bench pauses the sim right after setHours, freezing
      that spike. Reproduced with `people-bench --vel 8.5` (shots/w4/vel1), fixed by capping the gait's speed
      input at GAIT_VMAX 2.9 m/s (gait.ts; rig.ts stepLength cap matches) → shots/w4/vel4 natural jog stances;
      2.75 m/s jog unchanged (vel3). Pre-existing at every level, also in normal play for a few frames.
  (2) Skirts: shader.ts TAIL — front/back panels now span both thighs (front panel at the forward-most z, back
      at the rear-most; sideways/height blended by side) instead of snapping to one thigh. A slit by the
      forward thigh may remain — judge shots/w4/sk1 (skirt/side framings) first thing.
  (3) Hats: band tilted (0.665 + 0.045·cos φ of chin→crown: mid-forehead at the front, lower at the back;
      was a level 0.64 ≈ 1 cm above the brows). Crown lift (HAT_A[.].y) untouched — check "floating" in sk1.
      Moustache: tapered in height + thickness to the mouth corners, philtrum notch, drooping ends.
  (4) Eyes/face: sclera brighter with corner shading, iris with limbal ring + collarette + periodic fibres,
      stronger lid crease + lit lid fold + socket shade, inner-corner hollow, cavity occlusion under the nose /
      beside the wings / chin crease, FACE wrap 0.35 → 0.16. NOT yet judged on the bench (sk1 face/face2).
      Hairline softening NOT done (needs a look at where the hair cap meets the FACE region).
  Bench additions (people-bench.mjs): `--lods close,near` (same figure + frame per forced level, '' = by
  distance), `--persona jogger`, `--vel <m/s>` (pose a figure at a forced speed), shots skirt/side/face2.
  sk1 judged (docs/progress/real/w4_after_s2.jpg; cause sheet w4_squat_cause.jpg): skirts/dress closed in a
  walk at 1.3–1.6 m, small hem notch on a dress at 5 m; eyes show sclera + iris; hat brim above the eyes.
  Downtown shot: console clean, invariants {} (shots/w4/dt2.txt).
  Next: fix skirt slit / hat crown if still wrong → hairline → re-run the 4-figure people-bench
  (face,hand,body) and copy as docs/progress/real/w4_after_s2.jpg → then brief priorities 5 (carried things)
  and 4/7 (weight, variation).
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
* (s4) Hair clump bump at 0.0011 m along continuous strand lines: corrugated "shower cap" ribs → 0.0006 m with
  breaks along the strand length. Narrowing the lower face by 0.24 × bell: still a V chin → 0.15 + cheek fill.
* bench.mjs `pedestrian` for faces: its arm is ≥ 3 m and it frames the body middle → faces 25 px. Replaced by
  people-bench.mjs. The free camera stops at 3 m (camera.ts FREE_MIN_DIST): the bench narrows the fov instead
  (LOD distances scale with the fov, so the close level is chosen as for a real 0.75 m view).
* Hats at the close level fell to the 6-side lo hat (head poked through, black holes) → 24 sides.
* Straight strap sticks vanished into the rounder 20-side torso → `strapPath` hugs the surface.
* Face detail fade at px 3.5–9 mm: eyes vanished at 3–4 m (where real eyes still read) → 6–16 mm.

## Toggles / tiers / costs
* (s5) All s5 work is shader-only/free CPU: eyes, face fade (close level); hair sheen (all levels with HAIR_NORMAL —
  a few ALU); lock-end discards (sheet, fades by fwidth); fabric bump + fuzz (close level: inside pedFabric's
  det fade, i.e. off beyond ~1 cm/px). No new toggles: `?nopeopledetail` removes the close level (fabric/face);
  hair sheen/locks follow `?nohairline`? — NO, they are unconditional (add a toggle if the lead wants one).
* (s4) Close head ~56 × 80 rows ≈ +2.5 k verts, hair cap 40 × 14 + 8-deep sheet ≈ +0.8 k, fringe/bun/pony
  ≈ +0.4 k per close figure (close level only, < 15 m high tier). Not measured on the target; the old
  +9 k tris/close figure figure (s1) is now ≈ +13 k. All s4 work is inside the existing `?nopeopledetail`
  (close level off) except: colour shades + build spread (looks, free), gait build terms (free),
  fabric-on-skin mask and head wrap blend (shader, free), sheet locks/tips (VS, all levels with long hair).
* `?nohairline` — smooth hard-edged hair cap (no feathering, no locks). Close + near levels; FS cost tiny.
* Close-level carried items cost vertices only on figures < 15 m that carry them (umbrella ~+700 verts).
* `?nopeopledetail` — no close level (figures < 15 m use the old LOD0). Tier: close level to 15 m (high),
  11 m (medium), 7 m (low) — `CrowdRenderer.closeDist` set in pedestrians.ts.
* `?pedlod=close` forces every figure to the close level (`?pedlod=0..3` = near/lo/tiny/pin as before).
* Stats: `pedestrians.closeLod` = figures drawn at the close level. Capacity 48 (overflow → near).
* Cost (software GL, one run, view `27,0,17,20,30,18`, 12 h): by distance 886 ms/frame, 3.59 M tris; every
  figure forced to near (`pedlod=0`) 941 ms, 3.73 M; forced to close (`pedlod=close`, capacity 48, rest near)
  1054 ms, 4.16 M → ≈ +9 k tris per close figure (worst case 48 → +0.43 M tris). Real views have a handful of
  figures < 15 m. Needs an Adreno measurement; the medium/low tiers shrink the radius to 11 / 7 m.

## Sheets
* docs/progress/real/w4_after_s5.jpg — session 5: sclera before|after, dark long hair (sheen, lock ends, cap fix), clothing at ~1 m.
* docs/progress/real/w4_after_s4.jpg — session 4: head form, hair flow/volume, forearm stripes, walk, group 10 m.
* docs/progress/real/w4_after_s3.jpg — session 3: hairline, dress stride, umbrella / briefcase / bag flap.

## Next
* Skirts/dresses in a long stride split into a pointed diamond at the front hem (thigh-carried skirt rings;
  pre-existing at LOD0, more visible at close) — blend front/back vertices towards the mean of both thighs.
* T-shirt neckline zig-zags at the close level (neck rings 3 × 16; the hem boundary crosses the torso top cap).
* Carried things at close: shopping bag is a soft box (paper bag with handles / plastic bag), phone, cup.
* Moustache still a bar: taper ends, strand paint.
* Dark-skin faces: sclera could read a touch bright; check at 11 h and 18 h.
* Perf: measure `;nopeopledetail` on the target (software GL here).

## Tokens (session 1, tokens.py)
TOTAL weighted 5.1M (cache read 82 %, write 7 %, output 11 %); 183 calls, ctx median 229k / max 332k (over the
200k cap — the hidden system+brief is 31 % and per-call reminders 11 %); 0 cold calls, idle>5 min warm 2/cold 0.
Bash reads 20.5 %. Next session: stop at ~150k.

## Tokens (session 2, tokens.py)
```
TOTAL weighted 1.9M  (cache read 81%, cache write 9%, output 10%)

agent               calls   w(M)    %  ctxMed  ctxMax cold coldW%  idle>5min: warm/cold
LEAD                  104    1.9100.0    151k    205k    0     0%  0/0

WHAT THE COST BOUGHT (lifetime cost of each kind of content in context, all agents):
  system+brief                                    0.9M  46.6%
  Bash:read/grep                                  0.4M  21.2%
```

## Tokens (session 3, tokens.py)
TOTAL weighted 1.9M (cache read 76 %, write 11 %, output 13 %); 89 calls, ctx median 167k / max 223k. get_session's
context_usage read 0 this session (not usable) — estimate from tokens.py instead.

## Tokens (session 4, tokens.py)
```
TOTAL weighted 2.8M  (cache read 79%, cache write 8%, output 12%)

agent               calls   w(M)    %  ctxMed  ctxMax cold coldW%  idle>5min: warm/cold
LEAD                  122    2.8100.0    196k    253k    0     0%  0/0

WHAT THE COST BOUGHT (lifetime cost of each kind of content in context, all agents):
  system+brief                                    1.1M  37.6%
  Bash:read/grep                                  0.4M  13.8%
```

## Tokens (session 5, tokens.py)
TOTAL weighted 1.7M (cache read 77 %, write 10 %, output 13 %); 90 calls, ctx median 151k / max 197k.
