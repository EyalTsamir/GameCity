# Close people: everyone holds up from one metre

Stage 2 of `CLOSE-ROUND.md`. Branch `claude/happy-herschel-db9839`, port 5214. Time limit about 08:00 Israel 2026-11-01 (the machine's clock is Israel time, though `date` prints JST). End the last message with CLOSE-DONE. Master switch `?noclosepeople`, one `?no<name>` per feature (`src/core/closePeople.ts`).

## Resume here
Dev server: `npx vite --port 5214 --strictPort --host 127.0.0.1` from this worktree (`npm ci` done, `npm run bake` done once; rerun bake before any perf).
Files are LF in the working copy (git normalizes). Inline `node -e` with `${` or heredocs with apostrophes break in this shell: write patches with Write into the scratchpad (`patchN.cjs`, helper `patch(file, [[old, new]])` throws when a string isn't found).
The machine runs short of memory with the other sessions (`tsc` hit "out of memory" once at 1.5 GB free commit): retry, don't assume the code is wrong.
After editing, the first lab render can fail with an Error (Vite reloading): `curl` the page, wait 2 s.

**Tools (mine):**
- `node scripts/peoplelab-sw.mjs --out shots/lab/x.png --q "n=12&cols=4&cell=400&d=1&fov=19&force=0&seed=3&hour=12"`: software GL, no city, **no shared lock, 6 s**. Modes: `mode=turn&only=<i>&who=0&angles=0,35,70` (n = number of cells), `mode=seq&who=0&only=<i>&dt=0.14&part=body&d=3&angle=70` (walk frames), `part=face|neck|hand|foot|body`. `force=0` = always the close level, `force=1` near. The last label prints the close level's triangles. A 404 line is the favicon. Source `scripts/lab/people.ts`.
- `node scripts/peoplelab.mjs --out shots/lab/c2 --n 12 --cols 4 --rows 3 --cell 400 --hours 12,18.2,21.5 --d 1 portraits` (also `hands`, `feet`, `seq --kind walk|side|back|pass|sit --speed 0.25`): in the real city through the shared browser lock, can queue over 15 min, run in the background. DOF off unless `--sharp 0`.
- Lab framings also `part=hip|shin|shoulder`, `angle=90|170` for profiles and backs: these found most of round 3's faults, look at them after any change to the body.

## Audit (2026-10-31, 1 m, lab + city)
What made them carved wooden dolls, each confirmed by eye and by code:
1. A 3 mm ridge up the whole forehead (nose profile never ended above the bridge).
2. Relief stamped in plain X: a crease from temple to jaw, a flat cheek plane.
3. Skull: a shelf at the crown, a flat back; hats and hair pushed sideways only, so a flat disc and a cone on top.
4. Hair: 48 flat shard locks. Long hair a cage of wires.
5. Skin: one flat albedo, too red in linear, hard terminator, no cavities.
6. Same face for everyone, women masculine.
7. Bracelet of sleeve cloth at the wrist. Torn trouser shapes at the hips. Jagged star at the neck's foot. Flat triangular ears. Neck a post. Wire straps floating over the shoulders.
Second audit (city sheet c1, noon and night): straight dark patches on faces from the 5-sided shadow proxy head; dark skin vanishes at night; hairline tips bleached by the blend to skin; hair poking through hats; sky visible through a hat's open bottom; "briefs" at the hips.

Third audit (city sheets c2/c3, lab at hips, shins, shoulders, backs, profiles): puppet mouth, a bruise under the cheek, a bag of head behind the throat with the neck at the jaw, torn hairlines, fringe a flap with walls, a stripe down the back of bald heads, diamond corners and a V at the hips, a corner plus a notch at the shoulder, sawtooth folds and dotted seams on cloth, a jagged line in the wet eye, torn long hair under hats.

## Done so far (commits 7b4c71b … final)
| feature | toggle | cost |
|---|---|---|
| Close level has its own program `PED_CLOSE` (VS flag `CL`). Near keeps its old painted face | `?nocloseface` falls back to the old painted face | one more program at boot |
| Head form `HEAD_FORM`, rounder and wider below (film style, not a wedge), super-elliptic dome; relief in arc coordinate U = phi × 0.0775 (`faceRelief`) | close level | head now 44 sides, rows 2.6 / 4.2 mm |
| Baked face maps `faceMap.ts`: 256×384 ×2. Fine slopes, cavity, blood; wrinkle slopes and depth, eye shade | with closeface | 2 texture reads on face pixels |
| Eye opening shared as `EYE` (faceMap.ts), larger than life; larger still on women and the young | closeface | 0 |
| Skin light in `RE_Direct`: red wrap, oil sheen, glint, AO | closeface | FS ALU |
| Skin palette with more blue | `?noskin2` | 0, all levels |
| The person's own face: 12 knobs + age + woman + child as `pedBump` with analytic normals, hashed in the VS (no attribute free) | closeface | ~20 exp per head vertex |
| Paint per person: eye openness, brows as hairs, lips, freckles, age spots, beard shadow, moles | closeface | FS ALU |
| Eye gaze: `eyeGaze` in render.ts packs yaw, pitch, jaw into pose field spare1's word (only the CPU reads the prop code). Saccades by time slot, no state; holds the camera when `gazeCam`, else glances at it under 3.6 m; upper lid follows | `?nogaze` | CPU a few sin per close figure |
| Talking mouth: the party's speaker by time slot, jaw in syllables, mouth opens with teeth | with gaze | VS one exp |
| Hair: shards gone (`?nohairshell`), cut per person in mask bits 29–31: 0 clipped sides (scalp shows through), 1 side parting, 2 curls, 3 long/bob parted, 4 pixie, 5 pulled back; flow radiates from where it is combed from; hairline a real discard with the head's skin under it; forehead height of its own, men's temples go back with age; grey by strand | hairshell | fewer tris |
| Long hair lies on the head to the jaw, front columns start at the cheek, starts inside the cap; angled bob; hem without spikes; softer sheen | closeface | 0 |
| Beard: whole shell, its shape in the FS by hash (full, goatee, along the jaw, boxed), ends in single hairs | closeface | FS |
| Glasses (rims, bridge, arms) by hash and age, earrings | `?noglasses`, `?noearrings`, `FX` in body.ts, decided in `pedVisible` | about 200 tris |
| Yoke: torso meets the neck in one ring; neckline painted by `pedNeckline` (crew, scoop, V, loose crew by hash and sex; rib, band shadow, collarbones, pit of the throat, a fine chain on some) | always at close | about neutral |
| Backpack straps `strapOver` lie on the body ring by ring and go on under the arm; cross-body bag too | always at close | fewer tris |
| Hats: lining (no sky through the open bottom), curved brim with 40 sides, visor a curved peak, hair flattened under the hat, crown above the head; fringe off under hats | always at close | about +300 tris |
| Hat's shade on the face worked out in `RE_Direct` (`vPedBrim`), since the head's shadow lookup now starts 34 cm towards the sun (past the proxy head) | closeface | FS |
| Hips: pelvis below the hip ring inside the thighs, same normal field, plain cloth in the zone where they cut each other: no line | always at close | 0 |
| Hands: palm rounds off, 7-sided fingers with round tips. Ears: egg outline, rim, crest, fold, bowl, concha. Neck tapers | always at close | small |
| Fabric lines judged by their own derivative (no dashes), weave relief much lower (it read as corrugation) | close | a few fwidth |
| Softer face: mouth, chin and wings of the nose lower, fuller lower cheek, chin lower on the face, wider jaw bump, calmer red at the shadow's edge, softer cavities | closeface | 0 |
| Skull: the jaw's underside rises to the back, the nape meets the skull above the jaw, its normal runs on into the neck; plain skin behind the ears (no stripe at the back) | closeface | 0 |
| Hairline and fringe ends without torn points; fringe sweeps up at its ends and sinks into the cap, its locks calmer; sheet locks without a corner (no dots); long hair tucked up under hats; moustache breaks into hairs; curls have bumps | hairshell | 0 |
| Eyes: no step at the lid (no jagged glint), lashes taper at the corners, brows less dashed | closeface | 0 |
| Hips: pelvis behind the thighs, thigh's outer line runs on from the hip, one normal field across the midline: no V, no corner | always at close | 0 |
| Shoulder: last torso rings inside a rounder arm cap, wider slope. Neck a little thicker, tint in front only. Round scoop, straight V | always at close | 0 |
| Cloth at close: `pedRidge` without corners, fewer knee rings, seams no longer bump height, no puckers: no sawtooth and no dots | always at close | fewer ALU |
| Thumb with a round tip | always at close | 28 tris |
| Skin under a high sun: a fill on the lower face (normal tilted up for the diffuse term), no step across the face at the nose. Darkest skin lifts by day and more at night. Parting is scalp in the hair's shade, not a hole | closeface | one normalize |
| Bare limbs lit as skin, as the hand they run into (the flat region alternated the two lights at the wrist, in flames). Arm's top ring closed | always at close | 0 |
Close level now **14.6 k tris, 8.3 k verts** (was about 13 k at the start, 17.8 k before thinning the head).

## Final state (2026-11-01, close-round stage 2)
Quality tier: the features have switches but no tier of their own. They live on the close level, whose range is the tier (low 7 m, medium 11 m, high 15 m), and at most about 14 figures hold it (`closeBudget`).

Perf behind `power-guard`, fresh bake, 1920×1025 high, machine shared with other sessions. Reloads were useless here (overview, where nothing changed: 32 against 48 ms; street +4.4 ms, which did not survive the next line), so the street and market figures are in one page with `abprof`: the close level's cost against the near level (closeDist → 0.01), on and on `?noclosepeople`.
| view | close level on | on `?noclosepeople` | my share | budget |
|---|---|---|---|---|
| street `5,1.5,-65,9,0,6` | 2.0 ±0.64 ms | 1.46 ±0.58 ms | **+0.54 ±0.87 ms** (first run +0.56 ±0.8) | 0.7 |
| market `27.5,1,78.5,16,200,28` | 0.11 ±0.26 ms | 0.16 ±0.39 ms | none found (-0.05 ±0.47) | 0.7 |
| downtown | reloads only | | +0.37 ms, inside reload noise | 0.2 |
| overview | reloads only, unusable | | same triangles ±0.02 %, close level not drawn | 0.2 |
Street is inside the budget on the means, but the error bars reach past it. Downtown and overview are not measured to ±0.2: they rest on the close level not being drawn there and on the near and far programs being unchanged. Frames at street are about 35 ms here, near level or not: 30 fps at street is not met on this loaded machine, with or without this work.

Final checks on the commit before this log: typecheck clean; build 4.5 MB; overview at speed 4 invariants {} validate []; `hitch.mjs` (overview only) prog+0, 2 freezes at boot, none after; `walkhitch` 0 freezes, no new programs or geometries, hitch50 41 of its frames at mean 38 ms; `?diorama`, `?quality=medium|low` look right, no errors. `ui-test --q noidle`: 72 passed, 2 failed in the full run while other sessions shared the machine (kinds, film "a key hands the camera back"), both pass alone (1/1, 10/10). Program warnings in the console come from trains, boats, crops and sky, not people.
The last city portrait sheet came before "bare limbs lit as skin"; that change was judged in the lab only.

## Next, ranked
1. The look at 1 m is film-stylised and plain rather than rich: skin has little variation in the sun, faces stay a little long. Pushing towards realism was not started; 3 m and walking hold up better than 1 m stills.
2. Backpack strap has a corner and a step at the bust (a curved path left a gap: reverted). Lapel notch diamonds on jackets. A small notch where the arm's cap meets the shoulder in short sleeves. Crossing line of thigh and pelvis just under a hem, faint.
3. Long hair under a hat is tucked up at the close level only: it pops at the near-level change, which was not judged in motion. Close↔near cross-fade pops in general were not studied frame by frame.
4. Wide-brimmed hats are common and their brims large: a looks.ts choice, unchanged.

## Changes outside my files
none yet (body, shader, render, looks, faceMap, closePeople, lab scripts are all this session's or the people module's).
