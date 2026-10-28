# "Real things" round — every object a convincing physical thing (started 2026-10-28)

User brief (Hebrew, 2026-10-28; full text in docs/progress/NEXT-PROMPT.md): make the world truly real through
the things themselves. Every class (house, vehicle, person, tree, bench, fence, sign, …) climbs the ladder
form/proportion → construction → material (relief + wear) → contact → signs of life → variation → mechanics,
plus a few dense real places (market, harbour quay, café terrace, back yard, building site, station platform).
Out of scope: lighting, shadows, reflections, fog/atmosphere, sky, post (touch only when an object needs it).
Judge in plain daylight; night = regression check. Method: docs/progress/NEXT-ROUND.md (binding).
Overview must stay at least as impressive as now. Every feature: quality tiers + URL toggle. No silent compromises.

Lead session: session_01XuhAMczW3iK25AAWnf3qog, branch `claude/pensive-gates-bim12i`.

## Resume here (keep current)
* 2026-10-28 14:10 UTC — Lead: object bench `scripts/bench.mjs` built and committed (one page load, classes ×
  distances, sheets of 6 classes). Full audit capture running → shots/audit/all (≈45 min software GL).
  Next: write the audit (ranked table + photo tests) below, then launch wave 1 as sibling cloud sessions.
  Scheduled: hourly watchdog trig_01CiV41L5Hg1nJEasChWKp9Q, reset wake trig_01Kvk1fdjRY56tn14p7Vik8j (16:03 UTC).
  Delete both at the end.

## Machine restore (fresh container)
```bash
cd /home/user/GameCity && git pull origin claude/pensive-gates-bim12i
npm ci
mkdir -p shots/tools && cp scripts/agent-tools/{checkpoint.sh,autocheckpoint.sh,sheet.py} shots/tools/ && cp scripts/agent-tools/servers.sh shots/
(setsid nohup npm run dev > shots/dev.log 2>&1 < /dev/null &)
(setsid nohup shots/tools/autocheckpoint.sh 20 >/dev/null 2>&1 < /dev/null &)
```
Capture cost here (4 CPUs, SwiftShader): page load ≈ 100 s, then ≈ 25 s per 1280×720 capture. A bench run of
≈ 5 classes × 3 distances stays under 4 min.

## Tools
* `node scripts/bench.mjs --classes house,bench,car --dists 3,10,40 --out shots/bench/x [--pick n] [--q "skip=..."]`
  — the object bench. Moving classes are ray-picked and the sim paused. `--pick n` = n-th instance (variation).

## Workers
(none yet)

## Audit
(pending — shots/audit/all/sheet_*.png)
