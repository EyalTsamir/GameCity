# City sweep: capture and findings

Rules: `SWEEP.md`. Census: `sweep-census.md`. Known items: `sweep-known.md`.

## Resume here
Pilot done; report in the shared notes folder, `city-sweep-pilot.md` (a copy of its findings is below). Waiting for the coordinator: the go for the full capture (only with the browser free), `--night-views 3` or not, and how to dispatch the judges (`claude -p` script or Agent tool). Sonnet is the chosen judge.

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
