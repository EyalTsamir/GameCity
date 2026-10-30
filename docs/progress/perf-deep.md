# perf-deep — research all options, reach a real frame-time surplus

Branch `claude/perf-deep-cf97ce`, cut from `claude/pensive-gates-bim12i` @ eba5730. Not pushed or merged here: a coordinator merges.
Dev server: `npx vite --port 5192 --strictPort --host 127.0.0.1`. Frozen baseline eba5730: scratchpad worktree `base` on :5193.
Harness from the main checkout (shared lock), every GPU run behind `scripts/power-guard.mjs`:
`node scripts/power-guard.mjs --out <dir> --cwd C:/Projects/GameCity -- name node scripts/perf.mjs --url http://127.0.0.1:5192/ …`
(`power-guard.mjs` and `splitprof.mjs` were copied untracked into the main checkout's scripts/ to run there: delete after this round.)

## Resume here
Baseline measured. Decomposition (vertex vs fragment, overdraw, u8 target) queued. Nothing implemented yet.

## Baseline (eba5730, perf.mjs --gpu 1, 1920×1025, high, ×2 interleaved, AC power)
| view@h | ms/frame | scene | post | shadow | refl | GPU total | dc | tris |
|---|---|---|---|---|---|---|---|---|
| overview@12 | 48.5 | 36.7 | 5.5 | 0.9 | 3.0 | 46.3 | 225 | 3.10 M |
| downtown@12 | 55.1 | 40.3 | 5.5 | 1.3 | 2.2 | 49.5 | 226 | 3.39 M |
| street@12 | 46.5 | 33.2 | 6.5 | 2.6 | 2.0 | 44.6 | 226 | 3.51 M |
| market@12 | 47.3 | 36.2 | 5.3 | 2.4 | 1.2 | 45.2 | 188 | 3.39 M |
| overview@21.5 | 51.7 | 40.2 | 4.9 | 0.8 | 3.3 | 49.4 | 236 | 3.06 M |
| downtown@21.5 | 57.3 | 45.0 | 5.0 | 1.3 | 2.4 | 53.7 | 222 | 3.30 M |
| street@21.5 | 43.5 | 29.8 | 6.1 | 2.5 | 2.2 | 40.6 | 240 | 3.53 M |
| market@21.5 | 45.0 | 34.2 | 5.0 | 2.5 | 1.4 | 43.4 | 199 | 3.41 M |
(The cloud deck and cloud-shadow map count under `post`: they are renderer.render calls with another scene.)
