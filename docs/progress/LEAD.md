# Lead progress log (resume point for the whole project)

Read this first when resuming after an interruption (usage limits have cut runs before).
Per-module logs live next to this file: `docs/progress/<module>.md`.

## Lead state (graphics overhaul) — keep current; the watchdog resumes from here
* Updated 2026-10-18 22:08 UTC. Phase 2: workstream agents finishing (verify → fixes/polish →
  final sheets → "## Final report" in their gfx-*.md).
  - DONE: hardscape (16:20; lead spot-checked ab_court_quay.png ✔). Note for QA: camera pulls views
    < 100 m into close-ups (LOS_DIST in src/ui/camera.ts) — use ≥ 105 m for quay views.
  - DONE: people (16:35; lead spot-checked sheet_lineups + sheet_city_day ✔ — big close-up gain,
    modest but real at city distance; faces still mannequin-like < 8 m).
  - 16:40: people-review `a224fa07f1ef5777b` resumed for the independent re-review → writes
    "## Re-review (2026-10-18)" / "## Re-review final" in people-review.md. If it asks for a fix round,
    resume people `a1dd73a4100e0d9b6` with its ranked list.
  - ~16:50 UTC usage limit hit (reset 20:10); the 20:03 watchdog fired 7 min too early, so work resumed
    at the 22:04 firing (container had rebooted; auto-checkpoint 14d484c had saved everything).
    22:06: stage, night, water, buildings, vegetation, terrain + people-review resumed from their logs;
    watchdog switched to hourly so a reset never idles the team for more than ~1 h.
  - DONE: terrain (22:12; stadium uFlood snap on 'timejump' added after its report, browser-verified: sheet_flood_jump.png),
    vegetation (22:20; lead spot-checked final_close.png ✔ — clump relief, crown variety, stepped conifers).
    QA notes: backlit poplars at 18.2 look over-yellow (autumnal); station forest median at night still
    below adjacent ground (crown tops brighter); vegetation high = 27 clump cells pending the perf A/B.
  - Relayed 22:10: water — PRIORITY moon-glint blowout at 2 h (shots/night/final2/beach_2.png).
  - DONE: buildings (22:35; lead spot-checked ba_gold_18.png ✔ — glass keeps tower identity at sunset,
    weathering reads). QA notes: Haven Tower reflections look blotchy at 18.2 downtown (check closer);
    GPU estimate +0.2–0.4 ms in glass-heavy views (may exceed 0.3) — decide from the perf A/B.
  - DONE: night (22:55; lead spot-checked ba_night_C.png ✔ — lit street grid, floodlit stadium, dark at 2 h).
    QA note: lit tree crowns still read as soft blobs in the blurred overview foreground (vegetation
    canopy-underside lamp term) — check, tone down in vegetation/material.ts if needed.
  - DONE: water (23:10; lead spot-checked moon/moon_check.png ✔ — moon path narrow/silvery, 13.6 % → 0.07 %
    clipped; sheets_final/ba_harbor.png ✔ — ship/crane reflections, lit night harbour). Reflection pass
    +4–9 calls day / +9–15 night, < 0.2 M tris; GPU est. 0.6–1.2 ms (budget 1.5, high only + adaptive).
  - Still working: stage (NaN black blocks + recaptures); people-review (re-review).
* Safety nets (user request: never lose state, never trade quality for speed):
  - watchdog scheduled task `trig_01SEZGVfPdGEXrjuBsEYFnkw` (hourly at :06 UTC since 22:06, fires into this
    session even with the user's computer off): resumes agents cut off by the usage limit / restarts.
    Delete it when the overhaul is done.
  - `shots/tools/autocheckpoint.sh 15` (detached loop): checkpoint + push every 15 min.
  - lead check-in every 45 min while agents work (send_later, re-armed each time).
* Open cross-module items: stage bisects the NaN-style black blocks (night/buildings/hardscape frames);
  vegetation forest + terrain cliffs night readability; reflection draw calls at night (water).
* Next (lead): when people reports → resume people-review `a224fa07f1ef5777b` (re-review vs
  people-review.md §4/§7). When all 8 report → Phase 3 integration QA: full before/after matrix
  5174 vs 5173 (all POIs × 6.5/11/18.2/21.5/2 h), ONE consolidated perf A/B on a quiet machine from
  each log's "Perf variants for lead", soak, ui-test, typecheck, single-file build, cross-module fixes,
  decide legacy toggles/folders → Phase 4: short Hebrew report to the user, write
  "GRAPHICS OVERHAUL DONE" here, delete the watchdog, stop autocheckpoint, push.
* Phase-3 plan (written 22:40 UTC; tick items off below as they complete):
  1. Before/after matrix: `scripts/agent-tools/qa_matrix.sh base|new` (resumable; 8 chunks per side:
     11 POIs × 11/18.2/21.5 h + overview/downtown/harbor/beach/oldtown × 6.5/2 h; 1600×900;
     out shots/lead/qa/<side>/<chunk>/, log shots/lead/qa/<side>.log). The base side (5174) can't change,
     so it runs while stage finishes; the new side runs once stage has reported.
     Then build sheets (shots/tools/sheet.py) per hour, then Read and judge every view.
  2. Typecheck + `npm run build` (single file; record dist size vs before, ~2.2 MB) + dist smoke test.
  3. Consolidated perf A/B (machine quiet: no agent jobs) with perf.mjs, same-run variants, repeated ×2:
     views downtown/overview/westbrook/station 12 h, overview/harbor/stadium 21.5 h, people square 12 h;
     variants from every log's "Perf variants for lead" + an all-legacy variant. Note: `?legacyground`
     is shared by hardscape (roads/props ground) and terrain (lawns) — it reverts both.
     SwiftShader = relative only; the report tells the user to run perf.mjs on the Adreno.
  4. soak.mjs --minutes 4 --speed 4 (invariants, heap, fps); ui-test.mjs (all steps).
  5. Cross-module fixes from the QA notes above + whatever the matrix shows (small fixes by lead;
     larger ones go back to the owning agent).
  6. Legacy toggles/folders: decision after the perf A/B (they are the user's real-GPU A/B switch;
     weigh bundle size).
* Phase-3 progress: 22:33 base side of the matrix started (qa_matrix.sh base, background, resumable).

## History
* 2026-10-16 ~19:20 — Round 1: 12 builders launched via a Workflow; the account hit its 5-hour usage
  limit at 20:48–20:51. Six builders had worked ~1.5 h (traffic, pedestrians, buildings, render =
  sky+postfx, terrain(+water), camera/ui/audio); the other six died on start (stubs only).
* 2026-10-16 23:24 — Resumed after the limit reset (Ultracode off → individual background Agents,
  not a Workflow). Verified: tsc clean, all 18 modules load, 0 console errors, invariants clean.
  Round 2 launched 23:40: roads, vegetation+props, landmarks, harbor, rail+boats, ambient builders
  + a perf agent (traffic/pedestrian rendering, then buildings). Each keeps docs/progress/<x>.md.

* 2026-10-17 00:55 — Usage at ~90% of the 5-hour window (user warning). All 7 round-2 agents told to
  pause cleanly (loadable code + updated progress logs). Automatic resume scheduled in this session
  for 05:07 (backup check 05:47); agent ids for SendMessage-resume are in the session scratchpad
  (agents-round2.json). If the session was closed, resume manually: respawn each module from its
  docs/progress/<module>.md with its original brief.

* 2026-10-17 09:32 — The 05:07 auto-resume never fired (session-only timers). Resumed manually:
  dev server restarted; tsc clean. Round-2 state at pause: roads ✔ (verification left), harbor ✔
  (verification left), ambient ✔ (perf/night pass left), perf ✔ (traffic+peds 6.7→~0.6 ms; buildings
  trimmed), vegetation+props mostly done, landmarks partial, rail ✔ / boats not started.
  To save budget only 3 agents were resumed (SendMessage, context kept): landmarks, rail-boats (boats),
  vegetation-props. Roads/harbor/ambient/perf stay paused; the lead verifies them in the integration
  pass and resumes them only for specific fixes.
* 09:40 lead integration check: 0 errors/warnings, no failed modules, invariants clean, ~150 draw calls;
  beach "black half" no longer reproduces; station POI was occluded by downtown towers → now
  yaw -95 / pitch 42 / d 120 (verified). Real perf at the user's screen (1920x1200 @125% → ~1920x1025
  canvas): overview ~18.3 ms, downtown night ~21 ms (noisy: agents running); postfx ≈ 3.4 ms of it
  (HalfFloat targets; perf agent found u8 ≈ free). Plan: postfx optimisation pass (perf agent, with
  before/after visual comparison) once builders finish; keep pixelRatio 1.25 + adaptive scaling.

* ~10:30 — vegetation+props COMPLETE (1.2–1.6 ms), rail+boats COMPLETE (~0.6 ms). Lead removed the
  ridge-foot conifer strip (vegetation.ts RIDGE_FOOT_STRIP=false) — it clashed with catenary masts.
  Resumed: ambient (finish list + waterfowl avoid boats via ctx.services.boats.fleet.boats) and perf
  (new scope: postfx at 1920x1025 with before/after proof, then its final report). Landmarks still running.

* ~11:40 — landmarks COMPLETE (<1 ms), ambient COMPLETE (~0.3 ms). ALL BUILDERS DONE.
  Lead soak (4 min @4x = 1 game day): 0 errors, heap stable 214–242 MB, traffic flowing (watchdog 8/day),
  peds 26–429 by hour; only issue: long pedestrian overlaps (dog walkers). Review capture
  shots/review1 (11 POIs × 11h/18.2h/21.5h): high quality everywhere; issue: low clouds cover the
  city in the hero view and look like grey blobs at night. ui-test: 28/30 (chase toggle, dbl-click —
  probably artifacts of the built city). Production build: single dist/index.html 2.17 MB, runs from
  file:// with all 18 modules, 0 errors/warnings.
  Running: perf (postfx at 1920x1025), sky-polish (clouds), peds-polish (overlaps), camera-polish
  (ui-test failures, aircraft follow, first-run UX). Each keeps docs/progress/<name>.md.
  After they finish: final regression (tsc, capture-set, short soak, ui-test, perf 1920x1025),
  README controls sync, final build, file:// + serve.mjs test, clean shots/, launch for the user.

* 12:40–12:45 — usage limit hit again (no warning): all 4 polish agents cut off mid-task.
* 14:47 — resumed after the 14:30 reset. Verified before resuming: tsc clean; full city loads with
  0 errors and clean invariants; perf agent's files are byte-identical to its scratchpad mine2/ snapshot
  (its 12:42 bulk timestamps = completed swap-back, no stale originals); peds-polish never touched
  pedestrians.ts (no clobber). Rollback snapshot of src/ saved: scratchpad/snapshots/src-1446.
  State at cutoff: sky-polish ≈ done (final captures left); peds-polish mid-M2 (6 root causes found:
  follower speed cap, single-obstacle pick, dog-walker lateral span, squeeze mode, no avoidance in
  free-motion states, corner overflow); camera-polish mid-work (roof-lift floor); perf: postfx done
  (GPU 6.0/6.7 → 4.7/5.3 ms at 1920x1025, A/B-proven), wrapping up. All 4 resumed via SendMessage.

* ~16:00 — sky-polish COMPLETE (clouds frame the model on planned paths, 128–168 m, subtle at night;
  lead verified overview day/night). perf COMPLETE (adaptive controller was BROKEN — readPixels sync
  made it always drop to 0.6 scale; rewritten with async GPU timers; postfx 6.0→4.7 ms GPU at
  1920x1025; traffic+peds 6.7→0.6 ms). peds-polish COMPLETE (overlap pair-seconds −85..95 %, all
  invariants clean, stats unchanged). Lead fixes: cargo-ship funnel smoke → thin wisp (harbor.ts);
  pier benches moved onto the deck side of the walk (plan.ts); README controls synced to the in-app help.
  Declined: SMAA threshold 0.06→0.1 (−0.3 ms, visible AA loss). Waiting: camera-polish.

* ~17:50 — camera-polish COMPLETE (ui-test 40/40; train-into-tunnel follow, building framing from
  outside, aircraft follow, tour jump-cut fix, smooth low orbits). Lead fixes: #loading.done
  pointer-events none (style.css); boarding bus no longer lists its current stop as "next" (traffic/sim.ts).
  FINAL REGRESSION: tsc clean; soak 3 min @4x: 0 errors, heap 215–251 MB, 0 overlap hits (1 rare
  "party stuck 57 s", self-resolving), watchdog 3; ui-test 40/40, 0 console errors; perf @1920x1025
  (clean machine, noisy GPU clocks): overview ~18.4–22.9 ms, downtown night ~22 ms, beach golden hour
  ~25 ms — cost spread across modules (buildings ~2, terrain+water ~2.4); adaptive (fixed) drops AO
  first. Final build dist/index.html 2.2 MB runs from file:// (18 modules, 0 errors/warnings).
  DONE — launched for the user via scripts/serve.mjs.

* 2026-10-17 evening — GRAPHICS OVERHAUL (all 10 items of the visual audit). Plan, ownership, contracts,
  budgets and test protocol: `docs/progress/GFX-PLAN.md`. Harness now runs without a GPU (SwiftShader
  fallback, `scripts/browser.mjs`, `TH_LOCK_SLOTS=2`); frozen baseline worktree `/home/user/GameCity-baseline`
  served on 5174 (`shots/servers.sh`). Seven background agents launched ~18:40: stage (items 1+3, night
  ambient), night (item 2: lamp light map + emitters), water (4), buildings (5, 8, house massing of 9,
  far-field windows), vegetation (6), hardscape (7, gardens of 9), terrain (10). Each logs to
  `docs/progress/gfx-<agent>.md`; agent ids in the session scratchpad (agents-gfx.json). If the session
  is lost: respawn each agent from its log + GFX-PLAN.md. Next for the lead: relay stage S1 (new lighting)
  to all, relay cross-area requests, commit checkpoints, then integration QA (before/after matrix
  5174 vs 5173, perf A/B, soak, ui-test, build).

* 2026-10-17 ~23:10 — account usage limit: all 8 agents stopped mid-task (work saved; container
  later restarted). 2026-10-18 03:02 — limit reset: dev servers restarted, checkpoint 01b96a3 pushed,
  all 8 agents resumed via SendMessage with their context. Earlier coordination fixes (lead):
  LAMP_GLSL textureLod compile error, uLights not reaching 1 in captures (negative frame delta, no
  snap on clock jumps), FIFO screenshot queue + 45-min lock watchdog, ≲15-min-per-run fair-share rule.

* 2026-10-18 10:25–15:43 UTC — user-requested ~5 h usage pause. All 8 agents paused cleanly (state
  under "PAUSED"/"Resume here" in each gfx-*.md; checkpoint afdbf92). 15:43 — resumed (container had
  rebooted: servers restarted, lock queue cleared). Resume brief: finishing only (verify → fixes/polish
  → final sheets → report); no more per-agent SwiftShader perf A/Bs: the lead runs ONE consolidated A/B
  on a quiet machine from each log's "Perf variants for lead". Cross-module assignments: stage bisects
  the NaN-style black blocks seen in full-city night/dusk frames (night, buildings, hardscape) and adds
  a NaN/Inf guard at the bloom/merge input; vegetation (forest) and terrain (cliffs) make night
  silhouettes readable (median ≳ adjacent unlit lawn, moonlit tops); legacy toggles kept until QA.

## Module status (round 1 work, verified by the lead 23:30)
| module | state | open items |
|---|---|---|
| sky | done (dome, sun/moon, clouds + screen-space cloud shadows, env, rain) | — |
| postfx | done (custom depth tilt-shift, bloom, N8AO, AgX/ACES, adaptive) | costs ~4.4 ms → optimise in integration |
| terrain / water | done (slab+plinth+nameplate, ground, portals, walls, promenade railing+lamps, water+cut-away) | verify river lamp reflections |
| buildings | done (89 buildings, night windows, signs) | ~2.7 ms → perf agent (2nd priority) |
| traffic | done (IDM, signals, stop signs, buses, tunnels, parked cars, lights) | debug ground behind ?tground only; render cost → perf agent |
| pedestrians | done (243 people, crossings, benches, beach, bus/train hooks) | render cost → perf agent |
| camera / ui / audio | done (orbit/follow/chase/tour, HUD, minimap, labels, synth audio; 36 self-checks) | final polish |
| roads, vegetation, props, landmarks, harbor, rail, boats, ambient | round 2 in progress | see their logs |

## Key measurements (scripts/perf.mjs, downtown, noon, 1300x930, uncapped)
* before round 2: 15.78 ms all; skip buildings 13.04; skip postfx 11.43; skip traffic+peds 9.51 (−1.0 M tris).
* Budgets given to round 2: roads 0.8, vegetation+props 2.0, landmarks 1.0, harbor 1.0, rail+boats 1.0,
  ambient 0.5 ms. Overall target: 60 fps at ~1300x930 with adaptive render-scale as the safety net.

## Tools
* `scripts/shot.mjs` (screenshots + console/invariants), `scripts/capture-set.mjs` (view x time matrix),
  `scripts/perf.mjs` (real frame cost per variant, e.g. `;skip=buildings`), `scripts/soak.mjs` (long run).
  All share `scripts/.shotlock` and block Vite HMR inside the test page.
* Dev server: `npx vite --port 5173 --strictPort --host 127.0.0.1` (restart if down).

## Integration issues reported by agents (check at resume)
* Beach view renders its left ~55% black even with roads skipped (roads agent) — suspect postfx or another module.
* Traffic sometimes stops inside the level-crossing keep-clear box (traffic sim) — must never stop within [s0,s1].
* src/sim/rail/trainModels.ts had tsc errors at some point (rail agent claims clean at pause) — re-run tsc.
* Possible duplicate school sportscourt paint (roads paints court lines; landmarks may add hoops only).

## Next steps (lead)
1. As each round-2 agent reports: run it in the full city, look at its best views, check console/perf.
2. Integration pass: full capture-set (all POIs × 11h/18.2h/21.5h), soak test (4 min at 4x:
   invariants, heap, flow), perf across views; fix cross-module issues (z-fighting, overlaps,
   lighting consistency, duplicated items).
3. Review & polish round (visual critique per district, UX of camera/UI, night showcase).
4. Final: `npm run build` → verify dist/index.html from file:// and via scripts/serve.mjs,
   clean console, README controls, then launch it for the user (Launch Tinyhaven.cmd).
