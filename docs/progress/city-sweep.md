# City sweep: capture and findings

Rules: `SWEEP.md`. Census: `sweep-census.md`. Known items: `sweep-known.md`.

## Resume here
Full capture and judges are running under the coordinator's decisions of 2026-11-02 (pilot report: shared notes folder, `city-sweep-pilot.md`):
- **Capture:** `bash scripts/sweep-capture-loop.sh` (background): `--night-views 3 --freeze 1`, from 5198, into `shots/sweep`. Chunks of `shots/sweep/chunk-minutes` minutes (default 10; **raise it, e.g. 60, once the coordinator says sweep-fix-d has finished**). Stop: touch `shots/sweep/STOP-CAPTURE`. Log `shots/sweep/capture.log`, state `status.json`, kinds not found `absent.json`. Rerun to resume.
- **Judges:** `node scripts/sweep-judge.mjs [--max-images n] --jobs 3` (Sonnet, Read only, resumes). **Stop file: `shots/sweep/STOP-JUDGES`** (absolute: `C:\Projects\GameCity\.claude\worktrees\gifted-goldwasser-f1fa64\shots\sweep\STOP-JUDGES`). Totals `shots/sweep/judged2/summary.json`.
- **Order:** kinds at noon, walkable cells at noon, kinds at night, walkable cells at night, the rest.
- **Budget:** judges may take weekly up to 60 % and 5-hour up to 85 % (then pause until reset; `get_usage`). Baseline before the first 200 images: 5-hour 46 % (resetting about 02:30 UTC), weekly 32 %. After the first 200 images, report to the coordinator what they did to both and what the whole set would cost. If it won't fit, thin by dropping night views of ordinary cells, not objects.
- **Findings:** `node scripts/sweep-families.mjs` after each batch writes `docs/progress/sweep-findings.md` (coordinator wants it early, so fix sessions can start); `--consolidate` now and then; my eye checks, owners and costs go in `docs/progress/sweep-family-notes.json` by family id. Commit the findings as they grow. Top families must be checked by eye. Don't judge motion from these images: the TAA tearing is with sweep-fix-d.
- **Chunks are 15 minutes** since sweep-fix-d's urgent fix landed (coordinator); keep capturing from 5198 at b61a46c so the set is one build.
- **Square-on fault, found 2026-11-02:** walls and panes lose colour and interior when the camera is level within about 1° and the wall within about 1° of square-on (at 3° down, none of 12 shots; `shots/sweep-check/white-pitch/kioskd-5198.png`). The walker starts 3° down, so it isn't what a walker normally sees. Still in the newest build. Evidence in `shots/sweep-check/` (`white-sweep/*.png`, `off8/`, one-toggle captures in `white/`). Since then cells and axis-aligned kinds stand 8° off; earlier pictures stay as they are. **After the fix lands, shoot and judge again the kinds that were square-on** (344 kinds, about 1,700 noon images, about $48): delete their pictures and result files, then rerun. The cells shot so far looked along the axes too, so count those as well.
- **Merger cost:** Haiku cost $0.027 per subject at batch 40 and $0.05 at batch 80, against Sonnet's $0.019 on the first 42 subjects, so it saves nothing. It now sorts only severity 4 and up, at batch 40, and the score counts only those. The cause of the higher cost isn't known.
- **Eye checks and what is ready for fixes:** `docs/progress/sweep-family-notes.json`, shown at the top of the findings. Cells aren't judged yet, so the HOLD families wait for them.
- **New brief, 2026-11-02 (the user restated the goal: "wow, the AI thought of everything, a city of small details"):** answers now carry a tag, `shape`, `thought`, `bug` or `fake`, and live in `shots/sweep/judged2/`. Answers under the first brief stay in `judged/`, their findings in `sweep-findings-first-brief.md`. Everything judged is judged again in the same order, kinds at noon first. The findings open with a list per tag, no model needed; `shape` by kind is what fix sessions work through. Full lists: `sweep-tag-*.md`. Only bug and fake lines, severity 4 and up, are sorted into families.
- **Square-on pictures shot again now, not after the fix.** My decision: with the fault on, a white wall reads as a blank rectangle, so those pictures would fill the `shape` list with the fault, and they'd have to be judged twice. 1,138 kind pictures and 381 cell pictures were deleted (`shots/sweep-axis/`, gone for disk space); the capture shoots what's missing first, from 8° off, on the same build. So the re-shoot planned above isn't needed unless fix sessions change these kinds.
- **Flicker and motion:** `tremble.jsonl` is ranked by cell in the findings, but by eye its top is people and lorries passing the lens, so it's a poor list by itself. After the capture, on the newest build, not 5198: `node scripts/sweep-motion.mjs --retremble 60 --url ...` (the worst cells with the city stopped), `node scripts/sweep-motion.mjs --url ... --minutes 60` (the walk, repeat until `stop` says it walked everything, it goes on from `motion/walk.json`), `node scripts/sweep-motion.mjs --judge --max-events 300`, then `node scripts/sweep-families.mjs --render`. How frames are flagged is at the top of the script.
- **Disk, 2026-11-02:** free space swings between about 7 and 22 GB with the page file, so the margin is kept for the next swing. The one night view stays for the weekly limit alone: three views would end at 60–62 %. Plan: `shots/sweep/capture-overrides.json` wins over the loop's command line from the next chunk: one night view per cell (it goes round by cell; judges default to the same), JPEG 80 by day and 83 at night (at 80 the dark sky shows squares around the stars, `shots/sweep-check/q/`; sizes against 88: 80 about 0.75, 83 about 0.82). `sweep-axis`, `sweep-pilot` and `sweep-motion-test` were deleted, so the pilot's torn-people pictures named below are gone.
- **Judge pacing since 15:50 on 2026-11-02 (coordinator):** fix sessions come first, so judges pause at 70 % of the 5-hour limit, not 85 %, and start again after the reset. The weekly stop stays 60 %. The whole set won't fit under it: the images left alone come to about 61 %, before what fix sessions use, so the order decides what stays unjudged, and that's the tail: night cells and countryside. The capture's disk stop exits with code 2; start the loop again when free space is back above 5 GB.
- **Chunks count from the lock, since 2026-11-02 16:35.** `--max-minutes` used to count the wait for the browser lock too. With fix sessions testing, chunks of 15 minutes shot 1, 54 and 140 pictures. A chunk now gets its full 15 minutes of shooting, and holds the lock for all of them.
- Done means `sweep-findings.md` exists with its top families checked, and the last message ends with CLOSE-DONE. Reports go to the coordinator in English; a message is cut to 400 characters, so long ones go to the shared notes folder.

Pilot command (port 5198 serves the merged production build):
```
node scripts/sweep.mjs --part objects --ids named-ice-cream,vendor-icecream,stadium-spectator-home,stadium-player-home,feat-kiosk,veh-bus,prop-bench --out shots/sweep-pilot
node scripts/sweep.mjs --part squares --box -40,50,-10,90 --types walk --limit 40 --out shots/sweep-pilot
```
It has no dev server of its own; don't start one (about 700 MB).

## Pilot so far (2026-11-02, b61a46c at port 5198)
Go for the pilot came from the coordinator. Captures in `shots/sweep-pilot` (running city), `shots/sweep-frozen`, `shots/sweep-notaa` (A/B). Tool: 1.1–1.4 s per picture once the page is up, 0.30 MB per image, boot plus warm about 85 s. Probe (`--probe`, `shots/sweep-pilot/probe.json`): 265 of 291 finders found at noon, 0 errors; never found so far are listed by the probe file.

Judges: Explore subagents with `model` override, brief in the scratchpad `judge-brief.md` (no suspects named), one subject each. Subagent tokens: 33k for 6 images, 44k for 10 on Sonnet and Opus; 54k and 71–75k on Haiku, which also takes 120–175 s against 22–46 s.
| known flaw | Haiku | Sonnet | Opus |
|---|---|---|---|
| ice-cream scoops, puppet vendor | 3 | 5 | 5, 4 |
| stadium spectators, player | 5, 5 | 5, 5 | not run |
| warehouse blotched doors | 2 | 4 | 4 |
| kiosk wall changes colour and material with distance | missed | partly, as a night shift | 5 |
| doubled bus | 3 | 5 | 5 |
| torn, ghosted people | missed | 4 | 4 |
**Finding: temporal AA tears moving things.** Doubled bus front at `shots/sweep-pilot/squares/c0_-70/21h5_W.jpg`, torn people at `12_E.jpg`. On the same cell, `?notaa` running and TAA frozen both show solid people. Not watched at real speed by a person. `--freeze 1` (now the default) lets the city run between subjects and holds it still for the pictures, so the capture no longer shows this; the tremble check still runs on the moving city.

Finders: all 512 run at their hours, 0 errors, 462 found at some hour, 50 never (`shots/sweep-pilot/probe.json`). Frozen capture 1.52 s per picture. Cells now prefer pavement to carriageway and wait up to 3 s for a car to leave the camera's spot, after a bonnet filled one picture. Neither of those last two changes has been run yet.

## Pieces
- `scripts/sweep-census.mjs`: bundles the page's own plan, road network, occupancy, landscape and walk surface with rolldown, adds `scripts/sweep-kinds.json` (the code survey), writes `scripts/sweep-plan.json` and `sweep-census.md`. Hours per kind, stand-first points, waits and cells-only reasons are tables at its top.
- `scripts/sweep.mjs`: see its header. Resumes by file; stops under 5 GB, on battery under 25 %, at `--limit` or `--max-minutes`. Relaunches after a crash or a lost WebGL context, and puts a picture that fails twice at the back of the queue.

## Decisions (nobody to ask)
- Capture from the production build at 5198 rather than a dev server (coordinator). `--url` changes it.
- **Dry weather** throughout (`?weather=clear`): rain changes the whole picture and who is out. So nothing wet is judged; report it as not covered.
- The hour is held and the simulation runs at speed 1 for squares, so what moves is seen as it really is; a thing found as a kind is frozen only for its own shot.
- Settle by counting frames (26) rather than by time, so TAA has stopped jittering (24) whatever the frame rate. `closeset.mjs`'s 5 frames were too few (`sweep-flicker.md`).
- **The tremble check takes three frames, not two.** With two, a person walking scores like a tremble; the second difference is 0 for steady motion. It runs once per cell and hour (`--tremble`), because it costs three full read-backs. Stills can't show this, so it's its own list: `tremble.jsonl`.
- **Judges don't get `sweep-known.md`.** The coordinator wants known items not reported as new, and `SWEEP.md` wants judges unprimed. Both hold if the tagging happens at the merge, by me.
- Additions the document didn't ask for, because eye level can't see them: from below and over the roof for each building kind, the POI views, named buildings as kinds of their own (the ice-cream kiosk would otherwise be hidden in its group), one back face per building kind.
- Kinds that don't exist at noon or 21.5 are shot at their own hours (stadium crowd 15.5 and 20.5, wedding 10.9, market porters 7). Day-only kinds skip the night, to save empty searches.
- Sky things are shot from 20 and 60 m; fireworks once, from 60 and 150 m, forced by the event.

## Known limits of the census
- 75 kinds are marked `unverified`, and the finders of 512 kinds have not run. Expect some in `status.json`'s `notFound`; the pilot and the first run show how many. A `notFound` kind is still seen by the cells where it stands.
- Back-garden and scatter positions come from a Node run without trees and can differ slightly from the page.
- Cells at 10 m stand at one point: the middle if free. 35 cells have no ground to stand on (roofs, solid footprints).
- High quality only: the medium and low tiers aren't swept.
- Not covered by a still: motion, except the tremble check; rain; dusk (18.2 isn't one of the document's hours).
