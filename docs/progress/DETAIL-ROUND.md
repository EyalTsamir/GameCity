# Detail round: shared rules (2026-10-31)

The user asked for a long pass of several hours that upgrades everything that can be upgraded for detail and "wow", done
"in depth, wisely and with excellence". Six sessions work in parallel, each owning one category. No gameplay. Read this
file, `CLAUDE.md`, the top of `LEAD.md`, `perf-deep.md` ("The margin and what it buys") and your category's earlier logs
before starting. Do not redo what those logs already did.

## What counts
A viewer should stop and look. Judge from where people actually are: walking (`V`) at eye level, the free camera 5–40 m
away, and the opening film (`?film`, `src/ui/camera/filmShots.ts`), at noon, golden hour (18.2) and night (21.5). Rank
every idea by wow per millisecond, do the best first, and prefer one thing done superbly to five done adequately. Before
building, look for what reads as fake: a repeated module, a dead straight line, a flat surface, a missing contact with
the ground, something with no reason to be there. Things should look used, made and placed by someone.

## Spend the budget where it is cheap (measured on this GPU, `perf-deep.md`)
| currency | price |
|---|---|
| static triangles | 400 k per ms: geometry is the cheap way to add detail |
| leaf cards | 137 k per ms |
| figure triangles | 50 k per ms |
| full-screen fragment work | 1 ms = 0.5 ns per pixel; facades already cost 10–13 ns per pixel |

- Prefer build-time merged geometry in existing meshes and near-only cells over new shader work.
- Never call `invalidateFramebuffer` (+18 ms on this driver). A depth pre-pass only pays on heavy overlap (facades have it).
- **Budget per session: at most +1 ms in any of overview, downtown, street `5,1.5,-65,9,0,6`, market `27.5,1,78.5,16,200,28`
  on high**, and at most +250 k triangles in a full-city view (light-sky-water: +1.5 ms, on a quality tier). Measure it with
  `perf.mjs --variants ";no<yourswitch>" --repeat 2 --gpu 1`. Over budget means trim, or put it near-only. The frame is at
  about 33 ms and the target is a steady 30 fps, so the coordinator will measure all sessions together and can switch things off.
- 0 mid-run shader compiles (`hitch.mjs`), no per-frame allocations, console clean, no new dependencies or assets, no
  web workers, single-file build.

## Who owns what (stay inside your files so that merges are clean)
| session | port | owns |
|---|---|---|
| buildings | 5201 | `src/world/buildings*` |
| landmarks-harbour | 5202 | `src/world/landmarks*`, `src/world/harbor*`, hero interiors |
| streets | 5203 | `src/world/roads*`, `src/world/props*`, `src/world/terrain*`, `src/core/places.ts`, `src/core/plan.ts` |
| nature | 5204 | `src/world/vegetation*`, `src/world/groundcover*`, `src/world/landscape*` |
| people-vehicles | 5205 | `src/sim/*` (except ambient smoke look), `src/world/life*` |
| light-sky-water | 5206 | `src/render/*`, `src/world/water*`, `src/world/lamps*`, `src/sim/ambient/smoke.ts` |

If a finding belongs to someone else, write it under "Hand-offs" in your log; the coordinator passes it on. A small additive
edit in someone else's file is allowed only when your feature cannot work otherwise: keep it to a few lines and list it in
your log. Avoid `src/main.ts`, `src/ui/*` and `scripts/*` except for a new file of your own. Add your master switch in your
own `src/core/<name>.ts` in the style of `src/core/boxhunt.ts`, with one toggle per family; bug fixes may stay always on.

## How to work
- Run `npm ci` in your worktree, then `npx vite --port <your port> --strictPort --host 127.0.0.1`.
- Run every harness script from the MAIN checkout, so all sessions share one browser lock:
  `node C:/Projects/GameCity/scripts/<script>.mjs --url http://127.0.0.1:<port>/ …`. Six sessions share one browser, so keep
  captures in small batches, and run perf once per round. Always Read the PNGs.
- Use subagents freely (cheaper models are fine for judges). Check their claims against images and code. Audit with
  independent judges who rate images, then rank. Keep fan-outs under 10 agents.
- Work in rounds: audit, rank, build, verify by eye, measure, commit, log. Plan on at least three rounds, with a fresh audit
  each round. After each round write its summary in your log and carry on. Keep going until your ranked list has nothing
  worth its cost left. Then finish with the checks below and a short report.
- Commit after every feature, so that a cut-off loses nothing, and keep `docs/progress/detail-<session>.md` with a
  "Resume here" section after every milestone. Put before/after sheets in `docs/progress/detail/<session>/`.
- Don't merge, push or deploy: the coordinator does. Commits end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Power (the charger contact is unreliable)
On battery, frame times double and look exactly like a regression. Before any timing, and through it, use
`node scripts/power-guard.mjs --out <dir> --cwd C:/Projects/GameCity -- <name> node scripts/perf.mjs …`, and discard numbers
from a stopped run. Captures for looking at images are fine on battery. If the battery is under 25 % and discharging, stop
browser work, commit, log, and end your turn saying the charger needs attention: the laptop sleeps when the battery runs out.

## Quota
The weekly limit resets at 05:00 Israel time on 2026-10-31 (03:00 UTC), and was at 89 % when this round started. Check
`mcp__ccd_session_mgmt__get_usage` regularly. Before the reset, if the weekly figure reaches 97 %, finish the change in hand,
commit, update the log, and end your turn with the word PAUSED-FOR-QUOTA: the coordinator wakes you after the reset. After
the reset, stop in the same way at 90 %. Your context compacts by itself; the log is your memory.

## Final checks of a session
`npm run typecheck`, `npm run build`, `ui-test.mjs --q noidle` in full (the `kinds` step is a known flake: rerun it alone),
`shot.mjs --view overview --invariants --validate --speed 4 --wait 20000` with invariants `{}` and validate `[]`, `hitch.mjs`
0 mid-run compiles, `?diorama` and `?quality=medium|low` still fine, and the opening film still fine if your objects are in
it. Report: what you added, its toggles, perf and triangle cost, the best view and hour to see each thing, and what is left.
