# Resuming the graphics overhaul after an interruption

The overhaul (all ten audit items + realistic human figures) runs as background agents coordinated by
the lead. If the session was cut off (usage limit, container reclaimed), resume like this:

## 1. Machine
```bash
cd /home/user/GameCity && git fetch origin claude/tinyhaven-graphics-audit-l089m8 && git status
npm ci                                   # if node_modules is missing (fresh container)
# frozen baseline (original code) for before/after, on port 5174:
[ -d /home/user/GameCity-baseline ] || { git worktree add --detach /home/user/GameCity-baseline 9bf8ee1 && ln -s /home/user/GameCity/node_modules /home/user/GameCity-baseline/node_modules; }
# shots/ is gitignored — on a fresh container restore the helper copies kept in git:
mkdir -p shots/tools && cp scripts/agent-tools/servers.sh shots/ && cp scripts/agent-tools/{checkpoint.sh,autocheckpoint.sh,sheet.py} shots/tools/
shots/servers.sh                         # dev servers: 5173 working tree, 5174 baseline
```
The harness needs no GPU (SwiftShader fallback in `scripts/browser.mjs`); prefix scripts with
`TH_LOCK_SLOTS=2`.

### Automatic resume (usage-limit stops, container restarts)
* A watchdog scheduled task (`trig_01SEZGVfPdGEXrjuBsEYFnkw`, every 2 h) wakes the lead session —
  also while the user's computer is off — restores the machine, checkpoints, and resumes every agent
  that is not running, has no "## Final report" in its log and has no live browser job.
* `shots/tools/autocheckpoint.sh 15` runs detached and checkpoints + pushes every 15 min
  (`setsid nohup shots/tools/autocheckpoint.sh 15 >/dev/null 2>&1 < /dev/null &`; single instance;
  log `shots/autocheckpoint.log`). `checkpoint.sh` serialises itself with flock.
* Every agent keeps "## Resume here" at the top of its log, updated after every step; the lead keeps
  "Lead state" at the top of LEAD.md.

## 2. State
* Shared plan, ownership, contracts, budgets, test protocol: `docs/progress/GFX-PLAN.md`.
* Per-agent state and next steps: `docs/progress/gfx-<agent>.md` for stage, night, water, buildings,
  vegetation, hardscape, terrain, people; the human-figure spec: `docs/progress/people-review.md`.
* Lead history: `docs/progress/LEAD.md`. Everything that typechecked is committed on the branch
  (WIP checkpoints every ~40 min and at milestones).

## 3. Respawn each unfinished agent (one background Agent per workstream)
Prompt template (fill <agent>, <items>, <owned files> from GFX-PLAN.md's tables):
> You are the **<agent>** agent of the Tinyhaven graphics overhaul, resuming after an interruption.
> Read CLAUDE.md, docs/progress/GFX-PLAN.md (binding: ownership, contracts, art direction, budgets,
> testing protocol) and your log docs/progress/gfx-<agent>.md (brief, design, done, next steps) — the
> code in your owned files is the current state. Continue from "Next steps" with the same quality bar
> (thorough, polished, clearly visible improvement; iterate with captures against the 5174 baseline),
> keep your log updated after every milestone, message the lead (SendMessage to "main") at milestones,
> and finish with a ≤350-word report (changes, files, toggles, before/after sheets, perf, trade-offs).
For **people**, also point to docs/progress/people-review.md (§4 spec, §7 milestones). After people
finishes, a fresh reviewer re-reviews it against that spec.

## 4. Then the lead's remaining phases
Integration QA (full before/after matrix 5174 vs 5173 for all POIs at 6.5/11/18.2/21.5/2 h, perf A/B,
soak, ui-test, typecheck, single-file build) → final short report to the user (in Hebrew) → push.
