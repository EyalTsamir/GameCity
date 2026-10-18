# People review — human figures (pedestrians): findings + target spec

Reviewer: people-review (read-only; no source edits). Implementer: **people** agent
(`src/sim/pedestrians/figure.ts`, `render.ts`, `looks.ts`; pose plumbing only in `pedestrians.ts` / `crowd.ts`).
Status: **COMPLETE** (2026-10-17). Evidence sheet: `shots/people-review/review_sheet.png` (18 labelled tiles).

Method: read figure/looks/render/crowd end to end; measured the meshes numerically (bundled `figure.ts` in
node: vertex/triangle counts per LOD and per feature bit, part extents, joint pivots); replayed `computePose`
plus the shader's forward kinematics in node to measure foot height / foot slip / hand contacts over a gait
cycle; photographed a controlled lineup (sim frozen, everybody else hidden, hand-built looks and poses beside a
real bench) and the natural crowd at 13–190 m. All "before" images come from the frozen baseline (port 5174;
pedestrian code identical to the working tree at review time).

## 0. Summary — top findings (ranked by visual impact)
1. **Toy proportions** (every distance ≤ 60 m): arms 20 % short with mitten-ball hands (fingertips at the crotch,
   0.81 m instead of 0.68 m), shoulders 16–25 % too wide (0.55 m; heavy figures 0.58 m), a ball head 25 % too wide,
   no neck. The single biggest "low-poly avatar" tell. → sheet tiles 1, 2, 16.
2. **One body for everybody**: women = men × 0.92–1.0 (no waist/hips/bust), children = scaled adults with a bigger
   head, elderly = the same body tilted 5.7°, "heavy" = wider shoulders. → tiles 2, 3.
3. **Gait**: stiff compass gait (swing knee 34° vs 60–65° real, straight stance leg, rigid feet), stance foot slides
   11–24 cm per step, feet hover/sink ±3 cm, no pelvis/torso/head motion; elderly "moonwalk" (hips ±12° for 0.59 m
   steps); run bob inverted; rigid skirts. → tiles 4–6, §1.3.
4. **Sitting is broken at close range**: skirts hang through the bench as rigid cones, sitters perch 17–23 cm in
   front of the backrest, a briefcase/shopping bag stays in the hand and swings up in front of the face of readers.
   → tiles 7, 8.
5. **Construction**: 6-/8-sided rigid open tubes and flat boxes (shoes, ears, nose, beard block, visor, slab backpack,
   hair panel), blank faces, white-plate collars; knee/hip seams show when bent. → tiles 7, 10, 11.
6. **Clothing monotony / wrong hems**: every top tucked at 1.00 m, "short sleeves" end at the elbow, no jackets,
   coats, dresses or hoodies; swimwear is a onesie covering upper arms and thighs. → tiles 2, 9.
7. **Candy palette**: ~70 % saturated accent tops → crowds read as confetti/toys at POI distance. → tile 15.
8. **Night**: figures ignore the lamp light map; they read as evenly lit cut-outs in dark streets. → tile 14.
9. **Static poses**: a single "toy soldier" stand (A-pose arms, parallel straight legs) for everyone waiting.
10. **LOD/perf**: LOD0 and `lo` are indistinguishable at the 55/60 m switch and `lo`/tiny at 130/143 m (tiles 12, 13)
    — distances can move in; `lo` (24–150 instances per view) dominates the vertex cost, all levels cast full-cost
    shadows, 51 % of LOD0 triangles are hidden accessories, 15/16 attribute slots are used.

Spec headline (§4): adult 7.5 heads (head 0.155 m wide), deltoids 0.46/0.40 m (m/f), upper arm/forearm/hand
0.33/0.26/0.19 m, fingertips at 0.375 H, feet 0.27 m, per-kind rig table (man, woman, boy, girl, teen, elder m/f with
stoop) + build axis; sculpted skinned lofts, thumbs + shoe lasts at LOD0, parametric hems + one skinned "tail" mesh
for skirts/dresses/coats; gait from speed and leg length with IK-planted feet (slide ≤ 1 cm, hover ≤ 0.5 cm), knee
peak 60–65°, ankle roll, pelvis/torso/head motion; LOD0 ≤ 1300 vertices < 40 m, `lo` ≤ 450 vertices 40–110 m, tiny
≈ 240, optional 70-vertex pin > 300 m, tiny-geometry shadow proxy → people render cost at or below today's.

---

## 1. Measured facts (current code)

### 1.1 Proportions — every body kind is the same mesh (figure.ts `buildPersonGeometry`, `RIG`)
All kinds share one adult rig; only the instance `scale` (looks.ts:136), `girth` (x/z of the BODY part and an
arm shift, figure.ts:1072) and, for small scales, a head enlargement `hs = clamp(1 + (1 - scale)·0.8, 1, 1.32)`
(figure.ts:1076) differ. Women = men × 0.92–1.0; children = adult × 0.60–0.74 (+21–32 % head); elderly = adult
proportions + 0.1 rad forward lean (render.ts:57).

| measure (scale 1, metres) | current | real adult male 1.76 m | verdict |
|---|---|---|---|
| stature (crown incl. hair) | 1.77 | 1.76 | ok |
| head chin→crown | 0.232 (7.6 heads) | 0.23 (7.5 heads) | ok |
| head width × depth | **0.194 × 0.208** (hair cap 0.208 × 0.232) | 0.155 × 0.195 | **25 % too wide → ball head** |
| neck | none visible: torso top ring rx 0.075 at y 1.51, chin 1.522 | 0.11–0.12 wide, ~6 cm visible in profile | stump |
| shoulder (acromion) / pivot | top 1.455 / pivot 1.40 | 1.43–1.45 | ok |
| width across deltoids | **0.534** (girth 1.14: 0.58) | 0.46 (female 0.40) | **16–25 % too wide** |
| chest W × D | 0.386 × 0.208 (8-gon) | 0.33 × 0.24 | wide + flat |
| waist W (y 1.14) | 0.302 | 0.29 (female 0.25) | ok for men |
| hip W (pelvis / outer thighs) | 0.32 / 0.332 | 0.34 (female 0.36–0.37) | no female hips |
| hip / knee / ankle joint | 0.92 / 0.50 / ~0.07 | 0.93 / 0.50 / 0.07 | **excellent** |
| thigh Ø top / knee / calf max / ankle | 0.15 / 0.124 / 0.104 at y 0.44 / 0.078 | 0.17 / 0.105 / 0.115 at y 0.33 / 0.07 | knee fat, calf peak too high (cylinder-like shin) |
| elbow / wrist height | 1.13 / 0.87 | 1.10 / 0.85 | ok |
| upper arm / forearm / hand | **0.27** / 0.26 / **0.10** | 0.33 / 0.26 / 0.19 | **arm 20 % short, hand half length** |
| fingertip height | **0.785** (below crotch 0.82 by 3 cm) | 0.66 (mid-thigh) | **T-rex arms** |
| hand | ellipsoid 0.062 × 0.10 × 0.08 (6×4 seg), no thumb | 0.085 broad, 0.03 thick, 0.19 long | mitten ball, wrong orientation (thick in x) |
| foot (shoe) length × width | **0.196** × 0.08 (two boxes + sole) | 0.265 × 0.10 | **26 % short, brick shoes** |
| forefoot ahead of ankle | 0.134 | ~0.20 | stubby |

Children (scale 0.60–0.74 → 1.06–1.31 m, real age 5–11: 1.10–1.45 m): ≈ 6.0 heads (fine), but legs keep the
adult 52 % of stature (real age 6 ≈ 45–47 %), shoulders 0.36 m wide (real ≈ 0.27–0.30) — small broad adults.
Teens 0.88–0.98 scale, adult build. Elderly: same height distribution as adults, straight spine tilted 5.7° from
the hips (no kyphosis, no head-forward posture, no knee flexion).

### 1.2 Construction and cost per LOD (bundled `figure.ts`, counted in node)
| level | used for (930 px ref, `ls` scales with buffer height/fov) | vertices | triangles in buffer | always visible | hidden-by-feature |
|---|---|---|---|---|---|
| LOD0 `buildPersonGeometry(false)` | < 55 m | **1778** | 1570 | 765 | 805 (51 %) |
| lo `buildPersonGeometry(true)` | 55–130 m | 801 | 588 | 230 | 358 (61 %) |
| tiny `buildTinyPersonGeometry()` | > 130 m | 241 | 219 | 144 | 75 |
| pram / dog | always one level | 406 / 320 | 316 / 164 | | |

* LOD0 always-visible triangles by part: head 165, body 144, each arm 132 (66 upper + 66 fore), each leg 96 (24 thigh +
  72 shin incl. 3 shoe boxes). Feature bits in the buffer: hats 84/75/123 (hat/cap/hard hat), hair 63, long hair 54,
  bun 42, backpack 48, skirt 40, handbag 36, towel 36, vest 32, umbrella 28, suit/beard/shopbag/briefcase/cane 24 …
* Vertices > triangles (ratio 1.13) because boxes (shoes, ears, nose, bags, beard, visor…) are flat-faced 24-vertex
  blocks and lofts/ellipsoids duplicate seams. A smooth, indexed, ring-shared body gets ≈ 0.55–0.65 vertices per
  triangle → **more triangles can cost fewer vertices**. The scene is vertex-bound, so budget in vertices.
* Hidden accessories are collapsed to a point in the VS (`pedHidden`) — they still cost attribute fetch + a few ALU
  per vertex in both the main and the shadow pass (51 % of LOD0's triangles are hidden for a typical figure).
* Limbs are 6-sided (LOD0) / 4-sided diamonds (lo, tiny), the trunk 8-/6-/4-sided; all lofts are open tubes (no caps)
  rigidly attached to one bone each; joints are plain overlaps (thigh 0.465–0.96 over shin 0.06–0.53, etc.).
* Draw calls: 3 person levels + pram + dog + blob = 6 (+5 in the shadow pass). LOD0 capacity 260 (overflow → lo).
* Vertex shader per vertex: up to 5 `pedRX/RZ` mat3 builds with sin/cos (arm: elbow, shoulder X, shoulder Z, lean,
  pitch), `pedSlotColor` (16-way branch + 1–2 `pedRGB` unpacks with `pow(…, 2.2)`); the depth (shadow) material runs
  the same `pedPose`.
* **Attribute slots: 15 of 16 used** (position, normal, color, aInfo + instanceMatrix ×4 + iPoseA–D + iColA–C).
  ANGLE/D3D11 (the target: Adreno X1-45 on Windows) caps WebGL2 at 16 → any new per-instance data needs slots freed first
  (see §4.9).
* Material: `MeshLambertMaterial` + vertex colours (per-fragment Lambert in r186), no specular; night lift
  `0.07 · albedo · uNight` emissive; **no lamp light-map integration** (`LAMP_APPLY_VIEW`, core/lampLight.ts) —
  figures do not pick up street lights at night. Blob shadow: 0.62 m ellipse, α 0.36·(1 − 0.45·night), plus real
  shadow-map casting at all levels (switched off only when camera y > 150).

### 1.3 Gait kinematics (render.ts `computePose` + shader FK replayed in node, scale 1)
Phase advances with distance walked: cycle length = `scale·(0.85 + 0.42·v)` (crowd.ts:1304, = 2 steps).

| case | cadence | step | peak hip / knee (swing) | stance-foot slide along the ground | lowest sole over the cycle |
|---|---|---|---|---|---|
| adult 1.30 m/s (amp 1) | 112 spm | 0.70 m | ±23° / 34° | **16.8 cm** | **−0.5 … +3.3 cm** (hovers at heel strike) |
| commuter 1.45 | 116 | 0.75 | ±23° / 34° | 15.5 cm | −0.5 … +3.3 cm |
| stroller 1.05 (amp 0.84) | 98 | 0.65 | ±19° / 30° | 11.1 cm | −0.6 … +1.8 cm |
| elderly 0.82 (amp 0.66, hip ×0.78) | **84** | 0.59 | **±12°** / 24° | **21.8 cm** (legs sweep 0.36 m per step of 0.59 m) | −1.7 … +0.6 cm (toe sinks) |
| child 1.0 (scale 0.66) | 143 | 0.42 | ±18° / 28° | 6.3 cm | −0.5 … +1.0 cm |
| jogger 2.75 (amp 1.65) | 171 | 0.96 | ±34° / 82° | 23.7 cm | +0.4 … +11 cm; body **highest at mid-stance** (inverted bob) |

* Adult cadence/step at 1.3 m/s match real walking — keep that relationship. But the swing amplitude is not derived
  from the step, the stance leg is a rigid pendulum about the hip (knee 3° in stance, no ankle), and the bob
  (`0.022·(|cos φ| − 0.6)`, 2.2 cm p-p) is too small for the leg arc (a ±23° straight leg needs ≈ 6.8 cm), so feet
  slide 11–24 cm per stance and float/sink by up to 3 cm. Visible as "ice-skating" at close range.
* Swing knee peak 34° (real ≈ 60–65°), constant elbow 15° (real 15→45° with the forward swing), no pelvis rotation /
  list, no torso counter-rotation, no lateral sway, no head stabilisation; the foot is rigid with the shin (toes
  point down with the knee bend; no heel strike / toe-off roll). Running: no flight-phase bob (inverted).

### 1.4 Contacts (same FK)
* Pram: hands at y 1.07–1.10, z 0.49 vs push bar y 1.00, z 0.42 → hands float 7–10 cm above / 7 cm beyond the bar
  (scale-dependent: the pram is scaled clamp(0.95–1.05) while the pusher is 0.92–1.07). render.ts:75, figure.ts:854.
* Cane: rigid on the right forearm, tip at y 0.00–0.02 sliding 19 cm fore-aft with the arm swing — never planted,
  not synchronised with the opposite leg (render.ts:87–91, figure.ts:632).
* Bench: sitter root 0.06 m in front of the bench centre; back of the torso at z −0.08 vs backrest −0.25…−0.31 →
  **sits on the front edge with a 17–23 cm gap behind the back**, knees 0.30 m beyond the seat edge. Hip pivot
  0.45/scale + 0.075: feet hover 6 cm for scale 0.92 (fine for children: 18 cm). The skirt cone is rigid on the
  BODY part: seated, its hem lands at y 0.19 → **28 cm below the seat surface, i.e. through the bench**
  (render.ts:116–144, places.ts:233).
* Handbag box at the left hip (x 0.155–0.215) overlaps the hanging left hand/forearm (x 0.19–0.257); the arm swings
  through it.

---

## 2. Findings in detail (ranked by visual impact; evidence = before images, code = where it comes from)

**F1 — Toy proportions: short arms, mitten hands, wide square shoulders, ball head, no neck.**
Evidence: `crops/proportions_overlay.png` (measured on the render: fingertips 0.81 m = crotch, real 0.68 m;
shoulders 0.55 vs 0.47 m; head 0.20 vs 0.16 m), `lineup/lineupA_front.png`, `lineupA_34.png`, `lineupB_front.png`,
`lineup/typical_16m.png` (still obvious at 16 m). Code: arms figure.ts:519–562 (upper loft 1.105–1.445 = 0.27 m long
from the 1.40 pivot, forearm 0.87–1.15, hand ellipsoid 0.031×0.05×0.04 at y 0.835), `RIG` figure.ts:78–90
(`armX` 0.222, `upperArm` 0.27), shoulder caps figure.ts:525, torso rings figure.ts:441–463 (rx 0.193 at 1.41 m),
head ellipsoid figure.ts:468 (rx 0.097), neck figure.ts:466 (hidden inside the torso top ring at 1.51 m),
girth arm shift figure.ts:1066/1073. Arms hang in a slight A (roll 0.07, render.ts:55) clear of the waist.

**F2 — No body types: women, children, elderly and heavy people share the adult male mesh.**
Evidence: `lineupA_front.png` (#3, a woman in trousers with a bun, reads as a man from the front), `lineupA_side.png`
and `lineupB_side.png` (no bust/hips/belly in profile), `lineupB_front.png` (children = small broad adults; elderly
upright). Code: looks.ts:136–138 (only `scale`, `girth`), figure.ts:1072 (girth scales BODY x/z → wider shoulders,
bags, newspaper), figure.ts:1076 (child head factor from instance scale), render.ts:41–57 (elderly: hip ×0.78, arms
×0.55, lean +0.1 rad from the hips).

**F3 — Gait: compass legs, skating feet, rigid feet, rigid body, rigid skirt.**
Evidence: `lineup/gait_walk_man.png` (8 phases, side view; legs straight and split like scissors, the swing foot
toes point down with the shin), `crops/gait_man_feet_L_x2.png`/`_R_x2.png`, `gait_walk_elderly.png` (tiny hip
swing for long steps → slides; cane follows the hand), `gait_walk_woman_skirt.png` (skirt never moves),
`gait_jog.png` (acceptable silhouette), numbers in §1.3 (tools/fk/slip.ts, gait.ts). Code: render.ts:43–58
(sinusoidal hip ±0.4·amp, knee 0.05 + 0.55·max(0, cos φ), bob 0.022·(|cos φ| − 0.6), elbows constant), crowd.ts:1304
(step model independent of the hip amplitude), figure.ts:413–420 (shoes on the SHIN part: no ankle), figure.ts:565
(skirt on BODY), no pelvis/chest parts exist (PART list figure.ts:17–30).

**F4 — Bench sitting fails at close range.**
Evidence: `lineup/sit_34.png`, `sit_front.png`, `sit_side.png`, `sit_14m.png` — two skirts hang as cones *through*
the seat (hem 28 cm below the seat surface); all three sitters perch with a ~20 cm gap to the backrest; the reading
commuter's briefcase (and any shopping bag/cane) stays on the forearm and swings up in front of his face next to the
newspaper; thighs/knees show flat tube ends. Code: render.ts:116–144 (sit pose, `rootY` only, no backward offset),
places.ts:235 (seat spot 0.06 m in front of the bench centre — sim file: fix render-side with a local rootZ),
render.ts:465 (only `F.ROD` is dropped while sitting; `BRIEFCASE|SHOPBAG|CANE|HANDBAG` stay), figure.ts:565–580.

**F5 — Primitive construction and missing details.**
Evidence: `crops/lineupA_heavy_head_x3.png` (beard = brown block, box ears, blank face), `crops/lineupA_suit_skirt_upper_x2.png`
(white plate collar, tube arms with puffed shoulder caps, no neck), `lineup/lineupA_back.png` (slab backpack, flat
long-hair panel, ball bun), `lineup/poses_ground_side.png` (close-up of a suit figure: box nose/ears, hair helmet),
`sit_front.png` (open knee ends). Code: `Builder.box` usage throughout `buildPersonGeometry`, open lofts (`capTop/
capBottom` false for all limbs), 6-sided limbs / 8-sided trunk (figure.ts:371–373).

**F6 — Clothing monotony and wrong hems; swimwear onesies.**
Evidence: `lineupA_front.png` (#4: "T-shirt" sleeves to the elbow; all tops end at the same tucked waistline),
`lineup/poses_ground.png` and `crops/poi_beach_from_oldtown_11_x3.png` (sunbathers in full-colour suits covering
upper arms and thighs; a lying man still wears his cap, which stands up as a red block on his face). Code: derived
slots figure.ts:1051–1055 (sleeve boundary = elbow, shorts boundary = knee), top/bottom boundary at y 1.0–1.02
(figure.ts:424–463), swimwear swap render.ts:459–464 (`top = swim` colours TORSO **and** the TOP-slot upper arms;
`bottom = swim` colours the thighs; hats not removed), wardrobe looks.ts:149–163.

**F7 — Candy palette.** Evidence: `crops/poi_oldtown_11_x3.png`, `lineup/typical_40m.png`, `crowd/sqmid_18h2.png`.
Code: looks.ts:58–62 (TOPS: 30 entries, ~22 saturated accents), 76 (SPORT), children add SPORT+TOPS (looks.ts:253).
Real street crowds are dominated by neutrals and denim; the saturation is the main reason the crowd reads as toys at
120–190 m where anatomy no longer matters.

**F8 — Night: not lit by street lamps.** Evidence: `crops/poi_oldtown_21h5_x3.png` (figures equally bright inside
and outside the lamp pools; pasted-on look) vs `poi_oldtown_11_x3.png`. Code: figure.ts:1144–1147 (only
`0.07·albedo·uNight` emissive), no `LAMP_APPLY_VIEW` (core/lampLight.ts contract) in person/pram/dog materials.

**F9 — Static "toy soldier" idle.** Evidence: every standing figure in the lineups and in `crowd/sqclose_11.png`,
`crowd/sqmid_18h2.png`: legs parallel and straight, arms hanging stiffly in an A. Code: render.ts:61–72 (idle = ±2°
weight shift only); waiting/bus/fountain states all use it.

**F10 — Accessories and props.** Evidence: `lineup/dog_pram_34.png`, `dog_pram_side.png` (pram hands roughly on the
bar — acceptable at this scale, but FK says 3–10 cm off depending on scale; the dog is a stack of boxes, crude next
to the figures), `gait_walk_elderly.png` (cane rigid on the forearm, tip slides 19 cm per half cycle), lineup front
(handbag box in the swing path of the left arm), `poses_ground.png` (lying "arms behind the head" puts the hands
inside the head). Code: render.ts:75–107, figure.ts:601–640, figure.ts:931–995 (dog), render.ts:170–176 (lie arms).

**F11 — LODs: invisible switches (good) but wasted budget.** Evidence: `crops/lod01_52m_stack.png` (LOD0 vs lo at
52 m: no visible difference), `crops/lod12_128m_stack.png` (lo vs tiny at 128 m: none), `lineup/lod0_9m.png`,
`lod1_9m.png`, `lod2_9m.png` (what each level is at 9 m). Census (§4.9): LOD0 holds only 5–17 figures in close views,
`lo` 24–150. Code: render.ts:288–289 (55 / 130 m at the 930 px reference → 60.6 / 143 m at 1025 px), render.ts:386–387
(all levels cast shadows unless camera y > 150), figure.ts hidden-feature collapse (`pedHidden`).

**F12 — Shading.** Evidence: lineups (flat matte vertex colour, pale skin `#f7dcc8`/`#f3d2bb` blows out to near
white in sun — tiles 2, 10), figures' shadow-map shadows are soft smudges at 7–16 m (`lineupA_34.png`,
`typical_16m.png`; stage's shadow work), blob contact shadows barely visible on pale paving. Code:
`MeshLambertMaterial` figure.ts:1136, blob figure.ts:1279–1291 / render.ts:400 (α 0.36).

---

## 3. Evidence index (`shots/people-review/`)
* `review_sheet.png` — 18 labelled tiles (the summary above refers to its tile numbers).
* `lineup/` — controlled lineup beside a real Central Park bench (-14, 0, 19.5), 11:00, DOF off unless noted:
  `lineupA_{front,side,back,34}.png` (suit man, skirt woman, trousers woman, shorts+cap+backpack man, worker,
  heavy bald bearded man; 1600×900, 7.2 m), `lineupB_*` (elderly man with cane + hat, elderly woman, teen, jogger
  woman, boy 7, girl 6), `typical_16m.png` / `typical_40m.png` (DOF on), `lod{0,1,2}_9m.png`, `lod{0,1}_52m.png`,
  `lod{1,2}_128m.png` (forced levels), `gait_{walk_man,walk_woman_skirt,jog,walk_elderly}.png` (8 phases π/4 apart,
  side view), `gait_suit_34.png`, `sit_{front,side,34,14m}.png`, `poses_ground{,_side}.png` (towel sit, 3 lie
  variants, wave, angler), `dog_pram_{side,34}.png` (1280×720).
* `crowd/` — live crowd: `sqclose_11.png` (town square 14 m; some figures are mid-dither because a census had just
  re-warmed the population), `parkbench_11.png` (park 13 m, natural walk with pram/child/elderly), `sqmid_18h2.png`
  (40 m golden hour).
* `crops/` — `proportions_overlay.png`, head/upper-body zooms, gait feet, LOD stacks, POI crops (from the lead's
  full-city baseline `shots/baseline/oldtown_{11,21h5}.png`).
* `census.json` — per-view LOD counts via the renderer's own `write()` (only the first block, hour 3 = the boot noon
  population of 405, is representative; later blocks are inflated by repeated warm starts without sim time).
* `tools/lineup_driver.mjs` — re-runnable lineup (freezes the sim, hides everybody, places hand-built looks/poses;
  skips shots that already exist): `W=1280 H=720 TH_LOCK_SLOTS=2 node shots/people-review/tools/lineup_driver.mjs
  <outDir> [http://127.0.0.1:5173/]`. It writes `Member` fields directly (look, x/z/yaw, amp/phase, sit/lie/ground,
  wave…) — keep those field names or update the driver.
* `tools/fk/` — node checks that bundle the real `figure.ts`/`render.ts`: `node build.mjs slip.ts` (foot slide /
  hover per gait), `gait.ts` (per-phase table), `contact.ts` (pram hands, cane tip, wave, sit fit), `measure.ts`
  (vertices/triangles per level, per feature bit, part extents). Use them as acceptance tests for P2.

---

## 4. Target spec (build to this)

Art target: painted 1:87–1:43 sculpted figures (Preiser/Noch quality) seen at 12–60 m: correct proportions
and silhouettes first, then pose/motion, then paint. Stylisation allowed for legibility: heads up to +5 % height /
real width, hands up to +10 %, limbs up to +8 % thicker, shoes +1 cm sole. Never wider shoulders or shorter arms.

### 4.1 Proportions per body kind (metres at scale 1 for that kind; instance scale then varies ±4 %)
Joint = pivot height in the rest pose (standing straight). Widths are outer silhouette widths.

| | man | woman | teen (13–18) | boy 5–11 (ref 7 y) | girl 5–11 (ref 6 y) | elderly man | elderly woman |
|---|---|---|---|---|---|---|---|
| stature H | 1.76 | 1.64 | 1.62–1.72 (blend) | 1.22 | 1.16 | 1.71 | 1.58 |
| heads tall | 7.5 | 7.3 | 7.2 | 6.0 | 5.8 | 7.3 | 7.1 |
| head chin→crown | 0.235 | 0.225 | 0.228 | 0.203 | 0.200 | 0.235 | 0.222 |
| head width × depth | 0.155 × 0.195 | 0.145 × 0.185 | 0.150 × 0.190 | 0.142 × 0.175 | 0.140 × 0.172 | 0.155 × 0.195 | 0.145 × 0.185 |
| visible neck (front, chin→clavicle) | 0.06, Ø 0.12 | 0.07, Ø 0.10 | 0.06 | 0.04, Ø 0.08 | 0.04 | 0.04 (head forward 4 cm) | 0.04 (head forward 5 cm) |
| shoulder (acromion) height | 1.44 | 1.34 | 1.37 | 0.97 | 0.92 | 1.37 | 1.27 |
| width across deltoids | 0.46 | 0.40 | 0.42 | 0.29 | 0.28 | 0.44 | 0.39 |
| chest W × D | 0.33 × 0.24 | 0.30 × 0.23 (bust, +3 cm forward at y 0.72H) | 0.30 × 0.21 | 0.23 × 0.16 | 0.22 × 0.15 | 0.34 × 0.26 | 0.32 × 0.25 |
| waist W × D (at 0.62H) | 0.29 × 0.21 | 0.25 × 0.18 | 0.26 × 0.18 | 0.21 × 0.15 | 0.20 × 0.15 | 0.31 × 0.24 | 0.29 × 0.22 |
| hip W × D (at 0.52H) | 0.34 × 0.22 | 0.37 × 0.24 | 0.33 × 0.21 | 0.24 × 0.17 | 0.24 × 0.17 | 0.35 × 0.23 | 0.39 × 0.25 |
| hip joint | 0.93 | 0.85 | 0.88 | 0.57 | 0.54 | 0.89 | 0.81 |
| knee joint | 0.50 | 0.46 | 0.48 | 0.32 | 0.30 | 0.48 (stands 6° flexed) | 0.44 (6° flexed) |
| ankle joint | 0.075 | 0.07 | 0.07 | 0.055 | 0.05 | 0.075 | 0.07 |
| elbow (arm hanging) | 1.10 | 1.02 | 1.05 | 0.74 | 0.70 | 1.06 | 0.97 |
| wrist | 0.84 | 0.78 | 0.81 | 0.57 | 0.54 | 0.81 | 0.74 |
| fingertip | 0.66 | 0.61 | 0.63 | 0.44 | 0.42 | 0.63 | 0.58 |
| upper arm / forearm / hand | 0.33 / 0.26 / 0.19 | 0.31 / 0.24 / 0.17 | 0.32 / 0.25 / 0.18 | 0.23 / 0.17 / 0.13 | 0.22 / 0.16 / 0.12 | as man | as woman |
| foot length × width (shoe) | 0.27 × 0.10 | 0.245 × 0.09 | 0.26 × 0.095 | 0.19 × 0.075 | 0.18 × 0.07 | 0.27 × 0.10 | 0.245 × 0.09 |
| thigh Ø top / knee / calf (at y≈0.66·knee) / ankle | 0.17 / 0.105 / 0.115 / 0.07 | 0.17 / 0.10 / 0.105 / 0.065 | ×0.95 | ×0.68 | ×0.66 | as adult | as adult |
| posture | upright, chest up | upright, slight sway-back | slouch 3° | upright, belly forward 1 cm | upright | **thoracic stoop 12–18° (bend at T6 ≈ 0.72H), head forward, hips/knees 5–8°** | same + rounder back |

Body "build" axis (replaces today's uniform x/z `girth`): slim … average … heavy = waist/belly depth
+0 … +6 … +12 cm (front of the waist ring moves forward), waist width +0…+8 cm, hips +0…+4 cm, upper arms/thighs
+0…+15 % — shoulders stay put (today girth 1.14 widens the shoulders to 0.58 m).

Implementation hint: keep ONE canonical mesh, but make the rig parametric per kind: a small uniform table
(`uRig[kind]`: joint heights, shoulder/hip half-widths, head scale, limb radii factors, torso ring width/depth
factors per ring) indexed by a per-instance kind id (man, woman, boy, girl, elder-m, elder-f, teen = blend), and
place each vertex relative to its part's pivot with that kind's joints. Torso rings are tagged with a normalised
height t (pelvis 0 … shoulder 1) so waist/hip/bust/build offsets are a function of (t, angle) in the VS — no
morph-target attributes needed. Children: legs 0.47·H, torso relatively longer, head scale from the table (not
from `instance scale`).

### 4.2 Body construction (LOD0)
* Closed, smooth, indexed lofts with shared rings; no flat boxes on the body. Torso 12 sides × ~11 rings (crotch,
  hip, iliac crest, waist, lower ribs, chest/bust, upper chest, shoulder girdle with trapezius slope, neck base);
  elliptical/rounded-rectangle sections (flatter sides, fuller front/back), slight S-curve in profile (lumbar hollow,
  chest forward, shoulder blades back).
* Neck: separate tapered loft (Ø 0.12 → 0.11), tilted 10–15° forward, emerging from the trapezius ring; head joins
  above it (the jaw overlaps the neck front).
* Head: egg loft (10 sides × 8 rings) with jaw taper and chin, flatter sides, forehead/brow ridge, nose wedge
  (shared vertices, not a box), low flat ears; width 0.155 (man). Optional painted eyes/brows (two dark quads or a
  procedural darkening below the brow) — only at LOD0.
* Arms: 8 sides; deltoid cap blended into the shoulder ring; upper arm Ø 0.10 → 0.085 at the elbow; forearm
  0.085 (just below the elbow) → 0.06 (wrist); arms hang 3–5° forward and the forearm slightly pronated (palms
  face the thighs).
* Legs: 8 sides; thigh Ø 0.17 (blended into the buttock/hip ring) → 0.105 knee; calf bulge at the back (max at
  ≈ 2/3 of the knee height), shin straight at the front; ankle 0.07; feet a separate part (ankle joint).
* Joints that bend: **2-bone linear-blend skinning in the VS** for vertices within ±4–6 cm of knee, elbow, hip,
  shoulder, ankle and the waist (weight in a per-vertex attribute or `aInfo.w`): no gaps, no open tube ends showing
  at 90° knees (sitting) or raised arms (waving). Cost: one extra rotation per joint vertex.
* Hands (LOD0): palm block with rounded edges + one "finger mitten" (fingers together, slight curl) + a 2-segment
  thumb; 0.19 long, 0.085 wide, 0.03 thick; ~60–70 tris per hand; poses: relaxed (default), fist/grip (bags,
  pram, leash, cane, umbrella — curl the mitten), open (wave). lo: a flat paddle (10–12 tris). tiny: none.
* Shoes (LOD0): 8-ring last loft heel→toe with toe spring (+1 cm), 0.27 long, ankle collar; sole as its own colour
  ring (dark for leather, white for trainers); boots = shoe colour carried up the shin by a per-instance boot height;
  heels for some women's shoes (heel block + 3–4 cm lift of the heel ring, ankle pose compensates). ~60–70 tris per foot.

### 4.3 Clothing system (parametric, few hidden triangles)
Make garments parameters of the body mesh instead of separate hidden meshes wherever possible:
* Colour boundaries computed in the VS from rest-pose height/angle against per-instance hem values: sleeve end
  (sleeveless / T-shirt 1.30 / elbow / 3-4 / long → wrist), top hem (tucked 1.00 / untucked 0.93 / jacket 0.85 / coat
  → tail), trouser end (trousers ankle, capri 0.30, shorts 0.45–0.58), sock/boot height. This replaces the
  SHORTSLEEVE/SHORTS/TIGHTS bits with continuous variety and costs zero triangles. Add one ring at each common hem
  so colour edges are crisp (a cuff ring 1 cm proud of the limb sells the sleeve/trouser edge).
* "Tail" mesh = one lofted skirt that is **skinned to the thighs** (each ring vertex blends pelvis / left thigh /
  right thigh by its angle), with per-instance length (0.95 … 0.35 → mini/knee/midi/maxi) and flare; colour = bottom
  (skirt), top (dress: one colour from shoulders to hem) or jacket (coat/trench/parka over trousers). One mesh, three
  garment families. Seated, the tail follows the thighs and drapes over the knee — never through the bench.
* Upper layer: jacket/coat shell = torso rings pushed out 1.5 cm with an open front V (lapels as two thin wedges) and
  a collar ring; cardigan/hoodie (hood bump at the back of the neck), puffer (fatter rings + horizontal bands in
  paint), suit (lapels + white shirt V + tie). Per-instance "outer" colour slot; feature bit for the lapel/hood bits.
* Variety targets in a busy view: ≥ 6 recognisable silhouettes among 20 adults (suit, coat, dress, skirt+top,
  jeans+tee, shorts, hoodie/jacket, workwear, sportswear) and ≥ 4 hair silhouettes.
* Palette realism (looks.ts): today ~70 % of tops are saturated accent colours (`#e63946`, `#06d6a0`, `#ff006e`…)
  — the crowd reads as toys. Target per city crowd: ~55 % neutrals (black, charcoal, navy, grey, white, beige,
  olive, denim blue on ≥ 35 % of trousers), ~30 % muted mid-tones, ~15 % accents (more in summer / at the beach,
  sport and kids keep bright colours). Two-tone outfits: top ≠ bottom value contrast ≥ 25 % so legs read.

### 4.4 Hair, hats, faces
* One hair mesh: a scalp shell (+0.8–1.5 cm volume parameter) whose rings are driven by per-instance parameters:
  length (crop … chin bob … shoulder … mid-back), hairline (receding / bald-top for older men), fringe on/off,
  volume (curly/afro ×1.3), plus small feature parts: ponytail (2-segment, swings with the walk), bun (top or nape),
  beard (wrapped on the jaw, not a box), moustache. Set: men — short crop, side part, buzz, receding, bald, curly
  volume, man-bun; women — long straight, shoulder bob, ponytail, bun, curly volume, pixie, braid (opt.).
* Hats: flat cap, baseball cap (visor follows head pitch), sun hat, beanie (winter, cold hours), hard hat, fedora
  (elderly men), headscarf (some women), bicycle helmet optional. Keep the head pivot shared.
* Faces at LOD0 only: nose and chin in the silhouette; eyes as a soft darkening band (no "googly" dots); skin
  slightly warmer on cheeks/nose (vertex tint). Ears flat.

### 4.5 Accessories
* Bags held in a gripping hand pivot at the hand and hang plumb with a small lag/pendulum (rotate opposite to the
  forearm swing so they stay ~vertical): shopping bags, briefcase. Handbag on a shoulder strap sits at the hip
  *outside* the arm's path (x ≥ 0.25) and swings 5–10°. Backpack follows the torso lean/twist with straps.
* Cane: in the hand opposite the weaker leg, tip **planted** during the stance of the opposite leg (plant point
  fixed in world space via a per-instance IK target; lifted and swung forward in that leg's swing).
* Pram: hands **on** the bar (solve shoulder/elbow from the bar position in the pusher frame for each instance
  scale; scale the pram with the pusher or move the bar). Dog leash: keep the exact hand→collar leash.
* Umbrella: shaft through the gripping hand (part of the hand chain), canopy 8 ribs with a slight scallop.

### 4.6 Gait (walk / run) — derive everything from speed and leg length, plant the feet
Let v = speed (m/s), Lh = hip height of the kind × scale, Fr = v² / (9.81·Lh) (Froude), H = stature.
* **Step length / cadence** (dynamic similarity; matches adult data and the current adult numbers):
  step frequency `f = (1.15 + 0.55·v') · sqrt(0.93 / Lh)` Hz with v' = v·sqrt(0.93/Lh); step = v / f.
  Adult 1.3 m/s → 112 spm, 0.70 m (unchanged); adult 0.9 → 99 spm, 0.55 m; elderly (Lh 0.87, f ×1.02)
  0.82 m/s → 102 spm, 0.48 m (today 84 spm, 0.59 m); child (Lh 0.57) 1.0 m/s → 142 spm, 0.42 m. Running
  (v > 2.1 m/s): f = 2.6 + 0.12·(v − 2.1) Hz (2.75 m/s → 161 spm, 1.03 m step). Phase = 2π ∫ f/2 dt (one cycle = 2 steps),
  still advanced from distance walked (keeps feet and ground in sync); expose `gaitStep(look, v)` from render.ts and
  use it in crowd.ts:1304 (that line is pose plumbing).
* **Feet planted by construction** (LOD0 and lo; tiny may keep sinusoids): stance foot fixed in world space from
  heel strike to toe-off (60 % of the cycle walking, 35–40 % running); per frame in JS solve 2-bone leg IK (hip →
  knee → ankle; analytic, ~20 flops) for the stance foot target and for a swing-foot trajectory (lift 6–8 cm at the
  ankle at mid-swing, toe clearance ≥ 1.5 cm, foot reaches the next plant point with the heel first). Feed the
  resulting hip/knee/ankle angles through the existing per-instance pose path. Acceptance: stance foot slide
  ≤ 1 cm, sole penetration/hover ≤ 0.5 cm at any phase and speed 0.6–3 m/s (re-run the node FK check).
* Knee: loading response 15–20° at 10 % of the cycle, ~5° at mid-stance, 35–40° at toe-off, **peak 60–65° at 70–72 %**,
  ~0–5° just before heel strike. Hip (thigh vs vertical): +25–30° flexion at late swing / heel strike, −10…−15°
  extension before toe-off (asymmetric, not a sine).
* Ankle/foot roll: heel strike with the foot 15–20° toe-up, foot flat by 12–15 %, heel rise from 40 %, push-off
  rotating about the ball of the foot to 30–35° toe-down at toe-off, dorsiflexed in mid-swing (toes up for
  clearance). Needs two new pose values (ankle L/R).
* Pelvis: transverse rotation ±4–6° (forward with the swing leg), list ±3–4° (drops on the swing side), lateral
  sway ±1.5–2.5 cm toward the stance leg; feet land close to the midline (step width 8–10 cm centre to centre, so
  the legs adduct 2–3° in stance).
* Torso: counter-rotation of the shoulders ±3–5° opposite to the pelvis; forward lean 2–4° walking, 6–10° running;
  **head stabilised** (cancel the chest twist and half the pitch bob; the look-around `headYaw` added on top).
* Vertical bob: falls out of the IK (≈ 4 cm p-p at 1.3 m/s, lowest at double support, highest at mid-stance);
  running: lowest at mid-stance (knee 40°), highest in flight (≈ 6–8 cm p-p).
* Arms: shoulder swing amplitude ≈ ±(10° + 7°·v) walking (±19° at 1.3 m/s), more forward than back, phase-lagged
  ~5 % behind the opposite leg; elbow 15° at the back of the swing → 35–45° at the front; running: elbows 80–90°,
  swing ±30°, hands crossing slightly toward the midline. Elderly: ±8–10°, elbows 25°. Children: +15 % amplitude.
* Speed changes / stopping: blend from walk to stand by finishing the current step (plant the next foot then bring
  the trailing foot alongside), not by easing the phase to the nearest π while the root slides. Turning on the spot
  (yaw rate > 90°/s at low speed): a small step-turn (alternate feet re-plant every 30–45°).

### 4.7 Other poses
* Standing idle (default pose is a "toy soldier": legs parallel & straight, arms dead straight): contrapposto
  (weight on one leg, other knee 10–15°, pelvis list 3–5°, shoulders counter-tilt), arms 5–10° forward with soft
  elbows (15–20°); per-instance idle variants chosen at random and held for 5–20 s: hands in pockets (forearm into
  the front pocket, wrist hidden), arms crossed, hand on hip, hands behind back (elderly), looking at a phone (head
  pitch −25°, one/two hands in front of the chest at 1.15 m), holding a coffee cup (tiny cylinder in the hand),
  shifting weight every 4–10 s. All of these only need arm/leg angles + 1–2 new values (head pitch, wrist).
* Bench sitting: root moved back so the pelvis touches the backrest (hip joint ≈ 0.12 m in front of the backrest
  surface, ≈ 0.13 m behind today's seat spot: a render-side local `rootZ` offset, no sim change), torso leaning back
  12–18° onto the backrest, thighs on the seat sloping ≤ 5°, knee 85–100°, shins near vertical with feet flat on the
  ground (IK: if the lower leg is shorter than the seat, the thigh slopes down / feet dangle only for children).
  Held props while seated: briefcase/shopping bag set down beside the feet or on the lap (render-side: a prop
  'parked' pose, never following a raised forearm); cane leaned against the bench; handbag on the lap.
  Variants: legs crossed at the knee, ankles crossed, leaning forward with forearms on thighs, arm along the
  backrest, reading (newspaper held at 0.35 m in front of the face), feeding birds (forearm out). Tail garments drape.
* Ground sitting (towel): keep the leaning-back-on-hands pose but bend the elbows 5–10°, knees up 60–90° for one
  leg, feet flat; variant: cross-legged, hugging knees. Hats/caps come off (or lie beside the towel) when lying.
  Swimwear: torso-only (men: trunks as a shorts hem at 0.70–0.80 m, bare chest; women: one-piece = torso + hip,
  bikini = two bands) — upper arms and thighs stay skin (today the TOP/THIGH slots make a onesie). Lying: on back with arms behind the head (fix the
  arm–head intersection), arms along the body, one knee up; plus lying on the front (face down, head on forearms).
* Wave: upper arm raised forward-side to ~110°, forearm vertical, hand open, wave from the elbow ±20° at 2.5 Hz
  (not the whole arm).
* Push pram: hands on the bar (IK), slight forward lean 6–8°, shorter steps (×0.9), arms do not swing.
* Dog walking: leash hand forward-down with a small sync to the dog's pull; the dog should get rounder forms
  (lofted body/legs instead of boxes, ~250 tris), a 2-segment leg per leg (knee/hock) and a head that bobs.

### 4.8 Shading ("painted miniature")
* Stay matte Lambert-like but add: (a) per-slot material response — skin 0.35 and hair 0.45 wrap/translucency-ish
  softening of the terminator, a faint sheen on hair/shoes (cheap Blinn term, roughness ~0.6, intensity 0.05–0.1),
  fabric fully matte; (b) a painted "drybrush" value ramp: +6–8 % on up-facing surfaces (shoulders, cap tops), −8–12 %
  on lower legs/undersides and in creases (inner arm, crotch, under the chin) driven by normal.y and a per-vertex
  cavity tint baked into the mesh; (c) 3–5 % per-instance hue/value jitter on garments so equal palette picks
  differ.
* Integrate the lamp light map (`LAMP_APPLY_VIEW`, core/lampLight.ts contract) in the person, pram and dog
  materials so figures pick up warm sodium/LED light at night; keep the 0.07 emissive lift only as an ambient floor.
* Skin: keep 10 tones; add a slight saturation/value lift on faces and hands vs. arms so faces read at 20–40 m.
* Shadows: draw the shadow pass with a cheap proxy (see 4.9) and keep the blob contact shadow (reduce α to ~0.28
  when the shadow map is on, since both darken the same spot); blob should stretch with the stride (feet apart).

### 4.9 LOD plan, budgets and data model
| level | distance (930 px ref, ×`ls` as today) | figure height on screen | triangles in buffer (incl. hidden) | **vertices** | content |
|---|---|---|---|---|---|
| LOD0 | < 40 m (hysteresis ±3 m) | ≥ 70 px | ≤ 1800 | **≤ 1300** (today 1778) | full anatomy, thumbs, shoe lasts, face, garment tail/collars, all accessories, skinning |
| LOD1 `lo` | 40–110 m | 26–70 px | ≤ 700 | **≤ 450** (today 801) | same silhouettes: 6-sided limbs, 8-sided torso with waist/hip/bust, paddle hands, shoe wedge, hair shell + length, tail, hats; skinning at knees/hips only |
| LOD2 tiny | 110–300 m | 9–26 px | ≈ 220 | ≤ 240 (today 241) | as today but with correct proportions (narrow shoulders, long arms), tail, hair length; sinusoid gait ok |
| LOD3 pin (optional) | > 300 m | < 9 px | ≈ 50–70 | ≤ 70 | 3-colour stick: head/torso/legs, for the hero overview (449 figures × 200 tris today) |

* Budget LOD0 (≈ triangles): head 150, neck 20, torso 260, arms 2×110, hands 2×65, legs 2×150, shoes 2×65, hair
  shell 120, tail 120, collar/lapels/tie/hood 70, hats ≤ 150 (all kinds together), bags/cane/rod/newspaper/umbrella
  ≈ 160 → ≈ 1830; trim where needed. Typical visible share ≥ 65 % (today 49 %).
* **Shadow proxy**: draw ALL figures into the shadow map with the tiny geometry (one extra InstancedMesh whose main
  material collapses every vertex, `castShadow` only; LOD0/lo `castShadow = false`). Shadow texels are ≥ 5–10 cm, so
  hands/faces are invisible in shadows anyway. Today LOD0 figures cost 1778 vertices in the shadow pass; the proxy
  costs 241. Also skip shadow casting beyond ~150 m.
* Switch distances can move in safely: today LOD0 vs `lo` are indistinguishable at 52 m and `lo` vs tiny at 128 m
  (F11 evidence). Re-check with the new meshes (larger silhouette differences) using forced levels at the switch.
* Transitions: hysteresis band ±3 m on each switch distance; optional 0.3 s dithered cross-fade using the existing
  Bayer fade (draw the figure in both levels while switching).
* Measured census (renderer `write()` called synchronously per camera pose at 1920×1025, noon population ≈ 405;
  `shots/people-review/census.json`, first block): figures per level and vertices per pass today —

  | view | LOD0 | lo | tiny | VS vertices / pass | + shadow pass |
  |---|---|---|---|---|---|
  | square 20 m | 16 | 24 | 7 | 49 k | yes |
  | old-town street 40 m | 5 | 48 | 1 | 48 k | yes |
  | downtown plaza 16 m (busy, long sightline) | 7 | 77 | 100 | 98 k | yes |
  | beach 45 m | 17 | 45 | 0 | 66 k | yes |
  | old-town / park POI (120–130 m) | 0 | 63–88 | 62–108 | 65–97 k | yes |
  | overview 560 m | 0 | 0 | 405 (cap 720, overflow → lo) | 98 k | no (camera > 150 m) |

  Only ~3–9 figures are within 40 m even in close views; **`lo` dominates** (24–150 figures). So: LOD0 can be rich
  (it is rarely more than 10–30 instances), `lo` must get cheaper (≤ 450 vertices), and the overview wants a pin level.
  Target for the same views (LOD0 < 44 m at 1025 px, lo to 121 m, shadow proxy): square 20 m ≈ 25 k main + 11 k
  shadow (today 49 k + 49 k); plaza ≈ 68 k + 44 k (today 98 k + 98 k); overview with a 70-vertex pin ≈ 28 k (today
  98 k). The realism upgrade can come out **cheaper than today**. Verify with `perf.mjs` (`;hide=pedestrians`
  variant isolates the render cost; `pedlod=0|1|2` forces a level). LOD0 capacity 260 can drop to ~64.
* **Per-instance data model**: today 15/16 attribute slots. Free slots before adding data: (1) drop the per-vertex
  `color` attribute (its only use is a scalar tint → `aInfo.w`); (2) replace `InstancedMesh.instanceMatrix`
  (4 slots) by a plain `Mesh` + `InstancedBufferGeometry` with `iRoot = (x, y, z, yaw)` and scale packed elsewhere
  (frustum culling and picking are already custom) → 15 → 11 used = **5 free slots (20 floats)**. Needed:
  ankle L/R, pelvis yaw/roll, chest twist, chest bend (stoop), head pitch, lateral sway, rootZ (sit), wrist/grip,
  body kind/build, hair params, hem/sleeve/tail params, outer-garment colour ≈ 18–22 floats. If more is needed, pack
  pairs as half floats in integer attributes (`gpuType = THREE.UnsignedIntType`, `unpackHalf2x16` in GLSL 3).
  Avoid vertex texture fetch for pose data (per-vertex fetches × 1800 vertices).
* VS cost: compute each joint's sin/cos once per instance in JS when cheap (or pass angles and accept the ALU), and
  move `pow(·, 2.2)` colour decoding out of the per-vertex path where possible (precompute linear colours per
  instance in JS → still 24-bit packing but no pow, or decode only the slot the vertex needs — already the case
  except the always-decoded skin).
* Keep: one draw call per level (+1 shadow proxy, +1 optional pin level ⇒ ≤ +2 draw calls for the whole
  workstream), no per-frame allocations, `forceLod`, `?hide`, stats fields.

---

## 5. Keep (works well — must not regress)
* Architecture: one shared figure geometry per level with part / colour-slot / feature-bit vertex attributes, posed in
  the vertex shader from per-instance joint angles → one draw call per level; prams, dogs, blobs instanced; custom
  frustum culling + picking; no per-frame allocations; `forceLod` / `?pedlod=` / `?hide=pedestrians`; stats fields.
* Derived colour slots (THIGH/SHIN/FOREARM/TORSO switch with skirt/shorts/sleeve/vest flags) — extend the idea to
  continuous hems instead of replacing it.
* Persona wardrobes (suits + ties + briefcases for commuters, hi-vis + hard hats for workers, sport colours for
  joggers, muted palettes for the elderly, swimwear switch on the beach, children's bright tops), names/ages for the
  info card, family skin/hair inheritance.
* Leg joint heights (hip 0.92 / knee 0.50 / ankle 0.07) and the adult walking cadence/step at 1.3 m/s (112 spm,
  0.70 m); phase advanced by distance walked (never desynchronised from ground speed).
* Dog: trot phase from distance, sits when the walker stands, tail wag, leash computed exactly from the posed hand
  (render.ts `leftHand`) — reuse that hand-FK approach for prams/canes/bags.
* Pose blending order (ground before lie, lie off before rising), head look-around (glances while walking, more when
  waiting), reading on benches, waving, umbrellas in rain, beach towels, sunbathing swimwear swap.
* Bayer-dithered fade in/out (no alpha sorting), blob contact shadows, shadows skipped from high cameras,
  resolution/fov-scaled LOD distances, the crowd-sim "never walk through each other" guarantees (sim side — the new
  bodies must not get wider than today's footprint: shoulders ≤ 0.46 m, prams/dogs unchanged).
* Night readability lift (0.07 emissive) until the lamp-map integration lands.

## 6. Risks
* **Attribute limit** (16 on ANGLE/D3D11): adding pose/garment data without freeing slots first will fail to link
  on the target while working on desktop GL drivers with 32 slots. Free slots first (§4.9), test with
  `gl.getParameter(gl.MAX_VERTEX_ATTRIBS)`-agnostic budgeting.
* **Vertex cost**: the scene is vertex-bound; a "nicer" LOD0 with flat boxes and many hidden accessories could
  double the people cost. Budget in vertices, use the shadow proxy, and measure `perf.mjs` with
  `;hide=pedestrians` as the variant (and `pedlod=0` worst case) before/after.
* **Footprint / sim coupling**: the crowd avoidance assumes body discs ~0.45 m and party layouts; prams/dogs have
  fixed offsets (`DOG_OFFSET`). Do not widen bodies or move the dog/pram; seated root offsets must stay render-side.
* **IK on 400 figures**: keep it analytic and only for LOD0+lo (≤ ~250 figures), no allocations; tiny keeps
  sinusoids. Make IK robust at speed 0 (blend to the idle stance) and at 8× sim speed (large `simDt` → phase jumps:
  re-plant feet when a step is skipped instead of sliding).
* **Uniform scale + per-kind rig**: picking (`crowd.pick` radius from `look.scale`) and the leash/pram hand
  positions assume the current rig — update `leftHand()` together with the rig table.
* **Popping**: bigger visual difference between levels makes switches more visible — hysteresis and matching
  silhouettes/colour boundaries across levels (same hems, same hair length) are required.
* **Look consistency**: other agents are changing the light (stage) and night emitters; tune garment values against
  stage's final day key (S1) and check figures at 11:00, 18:00, 21:30.
* Shared files: crowd.ts is owned by the sim engineer for movement — only the stride formula line (phase plumbing)
  and pose-state fields may change there.

## 7. Suggested implementation order (milestones; each ends loadable, typechecked, with before/after shots)
1. **P1 — data model + proportions (biggest win per hour).** Free attribute slots (§4.9); per-kind rig table and
   build axis; fix arm length (upper arm 0.33, hands 0.19), shoulder width (0.46/0.40), head width (0.155), neck,
   feet length (0.27) — still with today's simple primitives, all three levels. Shadow proxy. Palette rebalance in
   looks.ts. Re-run the lineup (`shots/people-review/tools/lineup_driver.mjs`, §3) and perf.
2. **P2 — gait.** Gait step model shared with crowd.ts phase, ankle joint, stance IK + swing trajectory, knee
   curve, pelvis/torso/head motion, arm/elbow curve, run with flight, start/stop. Node FK acceptance test (slide
   ≤ 1 cm, hover ≤ 0.5 cm) + side-view gait strips.
3. **P3 — sculpted LOD0 body + skinning.** Lofted torso/limbs/neck/head, hands with thumbs, shoe lasts, joint
   skinning; lo rebuilt from the same profiles (fewer sides). Sit/raise-arm checks for gaps.
4. **P4 — clothing & hair.** Continuous hems, tail mesh (skirt/dress/coat) skinned to thighs, jacket/coat shell,
   collars/lapels/hood, hair shell parameters + ponytail/bun/beard, hat set; persona wardrobes updated.
5. **P5 — poses.** Idle variants + contrapposto, bench sitting against the backrest with feet on the ground and leg
   variants, ground sitting/lying fixes, wave, pram IK, planted cane, bags hanging plumb.
6. **P6 — shading + polish.** Lamp-map integration, drybrush value ramp/cavity tint, hair/shoe sheen, blob tuning,
   LOD hysteresis/cross-fade, optional pin LOD, dog upgrade. Final perf (target: ≤ today's pedestrian render cost on
   `high`; ≤ +0.3 ms worst case) and full-city evidence sheet.

---

## Re-review (2026-10-18)
Resume here: step 3/5 (resumed 22:06) — seen: gfx-people.md, city day/night sheets, lineups, gait sheet. Next: poses + distance_lod sheets, lab4, then own captures (close walk/turn, 40–60 m street day/night, LOD transition) under shots/people-review/re/.
