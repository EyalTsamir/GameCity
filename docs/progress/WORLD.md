# "A world, not a model" — realism round (started 2026-10-19)

User brief (Hebrew, 2026-10-19, paraphrased): after the graphics overhaul the city still reads as a clean,
tidy toy model. Wanted: a world one could live in — organic density at every scale (grass, flowers, leaves,
wear, imperfections; no empty/too-clean surface), life (movement, smoke, wind, people, things happening
when nobody looks), impressive from the overview down to street level. Reference image (medieval village at
golden hour, dense meadow flowers + tall grass in the foreground, mountains in aerial perspective, layered
forest, warm haze, smoke, prayer-flag lines, reflective river with reeds) sets the BAR and FEELING, not the
style. Start with an honest critique (real captures vs reference; question the "model on a table" frame),
plan from the biggest gap. Research proven real-time techniques on the web (reference only). Every change
verified by capture and judged without mercy. CLAUDE.md rules binding (procedural, single file, no new deps,
integrated-GPU target); if the vision needs a rule broken, propose it with its price — never compromise
silently. Never trade quality for speed. Document constantly (Resume here), commit+push often, hourly
watchdog scheduled task (delete at the end).

Branch: work continues from `claude/tinyhaven-graphics-audit-l089m8` (fast-forwarded) and is pushed to
`claude/pensive-gates-bim12i` (the session's designated branch).

## Resume here (keep current)
* 2026-10-19 — Setup: node_modules installed; baseline worktree `/home/user/GameCity-baseline` = 9de79e9
  (state at the start of this round) served on 5174; working tree on 5173 (`shots/servers.sh`).
  Next: critique captures (shots/world/critique/), write the critique + plan below.

## Machine restore (fresh container)
```bash
cd /home/user/GameCity && git fetch origin claude/pensive-gates-bim12i && git status
npm ci
[ -d /home/user/GameCity-baseline ] || { git worktree add --detach /home/user/GameCity-baseline 9de79e9 && ln -s /home/user/GameCity/node_modules /home/user/GameCity-baseline/node_modules; }
mkdir -p shots/tools && cp scripts/agent-tools/servers.sh shots/ && cp scripts/agent-tools/{checkpoint.sh,autocheckpoint.sh,sheet.py} shots/tools/
shots/servers.sh        # 5173 working tree, 5174 baseline
```
Scripts need no GPU (SwiftShader fallback); prefix with `TH_LOCK_SLOTS=2`.

## Critique
(pending)

## Plan
(pending)

## Agents
(none yet)

## Log
