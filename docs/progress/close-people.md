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
- A run `shots/lab/c2` was started at 23:04 at about commit 0d63eb0: READ IT when it lands. Then run one on the newest code.

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

## Done so far (commits 7b4c71b … 28e9a0d)
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
Close level now **14.6 k tris, 8.2 k verts** (was about 13 k at the start, 17.8 k before thinning the head).

## Next, ranked
1. Read `shots/lab/c2`, then a fresh city run: shadow patches gone? night skin? sheet dots on long hair (rows of tiny dots along the columns in the lab, may be SwiftShader only)?
2. Motion in the city: `peoplelab seq --kind walk/side/pass/sit`, `walkhitch`, close↔near cross-fade pops.
3. Curls: bumps in the normal for cut 2 (`pedN2` is there), silhouette lumps are limited now. Moustache hard-edged: feather like the beard. Fingernails. Shirt collars at close on the new yoke: check. Arm caps at the shoulder look boxy.
4. Final checks from `CLOSE-ROUND.md`: typecheck, build, ui-test `--q noidle` (kinds is a known flake), shot overview invariants/validate at speed 4 wait 20000, hitch 0 mid-run compiles, `?diorama`, `?quality=medium|low`, perf on `?noclosepeople` behind `power-guard` after `npm run bake`. Budget +0.2 ms overview/downtown, +0.7 ms street `5,1.5,-65,9,0,6` and market `27.5,1,78.5,16,200,28`.

## Changes outside my files
none yet (body, shader, render, looks, faceMap, closePeople, lab scripts are all this session's or the people module's).
