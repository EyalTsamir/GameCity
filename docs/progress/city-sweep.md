# City sweep: capture and findings

Rules: `SWEEP.md`. Census: `sweep-census.md`. Known items: `sweep-known.md`.

## Resume here
Census and `scripts/sweep.mjs` are written and committed. **The tool has never touched a browser**: the coordinator holds the lock for its A/B and asked for none yet. Only `--dry` and a syntax check of every expression have run. Next: wait for the coordinator's go, then the pilot.

Pilot command (port 5198 serves the merged production build):
```
node scripts/sweep.mjs --part objects --ids named-ice-cream,vendor-icecream,stadium-spectator-home,stadium-player-home,feat-kiosk,veh-bus,prop-bench --out shots/sweep-pilot
node scripts/sweep.mjs --part squares --box -40,50,-10,90 --types walk --limit 40 --out shots/sweep-pilot
```
It has no dev server of its own; don't start one (about 700 MB).

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
