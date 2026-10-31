# Close people: everyone holds up from one metre

Stage 2 of `CLOSE-ROUND.md`. Branch `claude/happy-herschel-db9839`, port 5214. Time limit about 08:00 Israel 2026-11-01 (the machine's clock is Israel time, though `date` prints JST). End the last message with CLOSE-DONE. Master switch `?noclosepeople`, one `?no<name>` per feature (`src/core/closePeople.ts`).

## Resume here
Dev server: `npx vite --port 5214 --strictPort --host 127.0.0.1` from this worktree (`npm ci` done, `npm run bake` done once; rerun bake before any perf).
Files are LF in the working copy (git normalizes). Inline `node -e` with `${` or heredocs with apostrophes break in this shell: write patches with Write / Edit.

**Tools (mine):**
- `node scripts/peoplelab-sw.mjs --out shots/lab/x.png --q "n=12&cols=4&cell=400&d=1&fov=19&force=0&seed=3&hour=12"`: software GL, no city, **no shared lock, 15 s**. Modes: `mode=turn&only=<i>&who=0&angles=0,35,70`, `mode=seq&who=1&dt=0.09&part=body&d=3&angle=70` (walk frames), `part=hand|foot|body`. `force=0` = always the close level. Source `scripts/lab/people.ts`. A 404 line in its output is the favicon: ignore.
- `node scripts/peoplelab.mjs --out shots/lab/c1 --n 12 --cols 4 --rows 3 --cell 400 --hours 12,18.2,21.5 --d 1 portraits` (also `hands`, `feet`, `seq --kind walk|side|back|pass|sit --speed 0.25`): in the real city through the shared browser lock, can queue over 10 min, run in the background. Uses `lensN=11` so autofocus doesn't hide things (`--sharp 0` for the real lens).
- First in-city run with the new face was started at 22:30 (`shots/lab/c1`): READ IT, the lab has no atmosphere or postfx.

## Audit (2026-10-31, 1 m, lab + city)
What made them carved wooden dolls, each confirmed by eye and by code:
1. A 3 mm ridge up the whole forehead (nose profile never ended above the bridge).
2. Relief stamped in plain X: on the side of the head X barely changes, so stamps squeezed into a crease from temple to jaw, and a flat cheek plane.
3. Skull: rings with a shelf at the crown and a flat back; hats and hair pushed sideways only, so a flat disc and a cone on top (pointed hats).
4. Hair: 48 flat shard locks. Long hair a cage of wires with white dots (narrow regular locks, strand discard, derivative specks).
5. Skin: one flat albedo, too red in linear (brown skin read as brick), hard terminator, no cavities.
6. Same face for everyone (four tiny knobs without normals), women masculine.
7. Bracelet of sleeve cloth at the wrist (`s` crossing the hem on the strip to the hand). Torn trouser shapes through the shirt tail (thigh tops outside the pelvis). Jagged star at the neck's foot (two tubes cutting). Flat triangular ears. Neck a post.
Motion (lab `seq`, side, 12 frames): the gait reads fine; still to judge in the city with `seq`.

## Done so far (commits 7b4c71b, 59dc45b + working copy)
| feature | toggle | cost |
|---|---|---|
| Close level has its own program `PED_CLOSE` (VS flag `CL`); near / far programs lose the face (`PED_NOFACE`, flag `NF`): smaller | `?nocloseface` falls back to the old painted face in the shared program | one more program at boot |
| Head form `HEAD_FORM` + super-elliptic dome; relief in arc coordinate U = phi × 0.0775 (`faceRelief`), broad forms only | always on at close level | 0 tris change so far (could drop rows now that fine forms are in the map) |
| Baked face maps `faceMap.ts`: 256×384 ×2, half face mirrored. A: fine slopes, cavity, blood. B: wrinkle slopes, wrinkle depth, eye shade | with closeface | 2 texture reads on face pixels, boot ~tens of ms, not measured |
| Skin light in `RE_Direct`: red-biased wrap at the terminator, oil sheen with per-zone strength and gloss, eye glint and lips through the same lobe; AO from the map in direct and ambient | with closeface | FS ALU on skin pixels |
| Skin palette with more blue (`?noskin2`) | `skin2` | 0, affects all levels |
| The person's own face: 12 shape knobs + age + woman + child as `pedBump` in VS with analytic normals; hash of skin, hair, bag, shoes, accent. **No attribute free** (16 limit, "Too many attributes"), so no iC3: hashed in VS | closeface | ~20 exp per head vertex |
| Paint per person: eye openness, brow as hairs (thin/heavy, arch), lips width/fullness/colour, freckles, age spots, beard shadow | closeface | FS ALU |
| Age byte: `faceBits` tier + bit 15 half tier → 8 steps (`vPedFB` bit 11) | closeface | 0 |
| Hair: shards gone (`?nohairshell`), cut per person in mask bits 29–31 (render.ts): 0 clipped sides, 1 side parting, 2 curls, 3 long/bob parted, 4 pixie, 5 pulled back | hairshell | fewer tris |
| Long hair solid: ends break only in last 2.8 cm and only if long enough; broad soft locks; strand direction analytic | closeface | 0 |
| Ears rebuilt (root, rim, fold, concha, lobe), neck tapers (`closeNeck`), neckline band (crew rib, 24×3 quads) on every top, thigh tops inside the pelvis, hats 24 sides with dome rings pushed along the normal, fringe with `aux2` for strand tips, wrist bracelet fixed | always at close | about +150 tris, −600 from shards |

## Next, ranked
1. Read `shots/lab/c1`, fix what the city shows (shadow patches from the 5-sided proxy head on faces at noon? the lab shows none but its shadow frustum differs: `?noshadowproxy` in the lab, `pedshadowlift` code in `peopleMaterial`; night: oxblood skin, hard shade, shop glow).
2. Faces: women still a bit masculine and heavy-jawed; eyes small; check children and very old; mouth corners; nose wings; more distinct looks; brows on dark skin. Glasses (cheap ring geometry, feature via a free hash bit, big gain in character), earrings, necklace, moles.
3. Hair: variety and hairline softness; temple cross-hatch from `pedStrands` at the first rings; fringe tips; side panels of long hair stand off the cheek as flaps; flow per cut in `pedHairFlow` (side part, pulled back, parted); grey streaks with age; receding hairlines (recede in FS via `vPedFace.x` threshold); beard and moustache are lumps: strands, feathered edge.
4. Eye gaze: iris shift `gz` is a stub. Needs camera direction in head frame in VS (flat varying) and "looking at you" only when `m.gazeCam`. Head gaze exists (crowd.ts `trackGaze`). Talking mouth (jaw drop through `pedBump` when speaking) has no channel: `spare2` is the pony swing; hair and FB bits only static.
5. Necklines: V and scoop with skin and collarbones in FS; shirt collars at close; necklace. Crotch jag on trousers (torso's fan vs thigh tube, dark polygons at the front); thumb sits low, sausage; nails; dashed stitch lines on shirts and trousers look like dashes: check at 1 m; cloth moiré.
6. Drop head rows and sides (56 sides, 1.8 mm rows) now the fine relief is in the map: saves about 2–3 k tris per close figure, pays for everything above. Perhaps a portrait tier under 4 m only if budget remains.
7. Motion in the city: `peoplelab seq --kind walk/side/pass/sit`, `walkhitch`, and level switch pops (close ↔ near cross-fade: near level still has the OLD painted-less head and old hair: check the change at 15 m does not read as a different person; near's hair, skin palette same).
8. Final checks from `CLOSE-ROUND.md`, perf on `?noclosepeople` behind `power-guard`, `npm run bake` first. Budget +0.2 ms overview/downtown, +0.7 ms street/market.

## Changes outside my files
none yet.
