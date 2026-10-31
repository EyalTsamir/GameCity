# bake — bake ahead of time, keep sharp up close

Branch `claude/hopeful-babbage-4a203f`, cut from `claude/pensive-gates-bim12i` @ 5b70883. Not merged, not pushed, not deployed: the user decides after the report.
Dev server: `npx vite --port 5210 --strictPort --host 127.0.0.1`. Frozen baseline 5b70883: scratchpad worktree `base` on :5211 (recreate with `git worktree add`).
Every GPU number behind `scripts/power-guard.mjs`, from the main checkout. The charger flaps: wait for stable AC and retry.

## Resume here
In progress: see the sections below; this log is updated at every milestone.

## Where the frame goes (5b70883, 1920x1025, high, noon, ms/frame, 2 interleaved runs, spread ±0.1)
Baseline: overview 39.8, downtown 38.2, street 36.3, market 34.2.
Upper bounds, the whole term removed (delta):
| what | overview | downtown | street | market |
|---|---|---|---|---|
| facade procedural part stubbed (keeps lighting) | -2.5 | -8.8 | -6.2 | -5.4 |
| same with two texture fetches, i.e. what a baked facade would cost | -2.8 | -8.8 | -6.2 | -5.4 |
| land procedural part stubbed (keeps lighting) | -6.7 | -0.6 | 0 | -0.1 |
| shadow sampling off (all materials) | -3.4 | -3.0 | -2.4 | -3.7 |
| aerial perspective off (`?noatmo`) | -3.5 | -2.2 | -0.9 | -2.5 |
| lamp light returns 0 (noon: its gain is 0 anyway) | -2.4 | -0.9 | -0.9 | -1.2 |
| IBL fetches replaced by constants | 0 | -0.1 | 0 | 0 |

So the procedural part is nearly all of what a facade or land pixel costs, and a texture fetch costs next to nothing by comparison.
**The land is the first candidate at the overview, not the facades** (the logs and the brief said facades): facades there are 6 % of the screen.

Facade pixels by distance from the camera (share of the screen, then of those pixels):
| view | screen | distances |
|---|---|---|
| overview | 5.9 % | 97 % at 500-800 m |
| downtown | 44 % | 20 % at 100-150, 55 % at 150-200, 23 % at 200-300 |
| oldtown | 45 % | 44 % at 60-100, 36 % at 100-150, 20 % beyond |
| park | 24 % | 30 % at 100-150, 58 % at 150-200 |
| harbor | 15 % | 62 % at 150-200, 37 % at 200-300 |
| street | 26 % | 88 % at 15-25 m |
| market | 28 % | 24 % at 10-15, 71 % at 15-25 |
| walk | 9 % | 75 % at 40-60 |

Consequence: a bake for distance wins at downtown, old town, park, harbour and overview, and nothing at street and market, where facades cost 5-6 ms at 15-25 m. Those need a different answer (below).
