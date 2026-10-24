# Lead progress log (resume point for the whole project)

Read this first when resuming after an interruption (usage limits have cut runs before).
Per-module logs live next to this file: `docs/progress/<module>.md`.

## Lead state (world round, 2026-10-19 → 10-24) — see docs/progress/WORLD.md (its "Resume here" is the live resume point)
* "A world, not a model": the tabletop frame was replaced by a landscape to the horizon (`?diorama` keeps the
  model); 7 workstreams (world, air, ground, foliage, streetlife, life, wear) each with a final report in
  docs/progress/world-<name>.md; lead integration QA in WORLD.md (int2 captures shots/world/lead/int2).

## Lead state (graphics overhaul) — keep current; the watchdog resumes from here
* GRAPHICS OVERHAUL DONE (2026-10-19 07:05 UTC): all 10 audit items + realistic figures implemented, verified and
  pushed; integration QA complete; report in docs/progress/GFX-REPORT.md. Open for the user: real-GPU perf.mjs run
  (commands in the report), then strip the legacy A/B copies. Watchdog deleted, autocheckpoint stopped.
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
  - 22:45 people re-review DONE: verdict ship (people-review.md "## Re-review final"). Lead decided to do
    the fix round anyway (quality bar + project rule): people `a1dd73a4100e0d9b6` resumed for (1) corner
    gait drag/split strides (visible at 15–30 m), (2) 2 KB/figure-frame garbage → < 100 B, (3) trousers +
    rounder shoe toes without new vertices. Reports under "### Fix round (re-review)".
  - 23:00 stage NaN hunt: source not reproduced; NaN/Inf guards at bloom luminance, tilt-shift prefilter and
    merged-pass input (+ ?nanviz debug). Found 2 water bugs → water `ab69acb77de46c492` resumed (priority):
    (1) reflection level 0 (?nowaterrefl = medium/low preset + adaptive refl-off) renders beige/rainbow
    garbage (shots/stage/nan/refl_off_20.png); (2) dark ~30 m square near (178,−98) from 19.4 h with
    reflections on (sweep_14.png); (3, secondary) flat lilac dusk sea at overview.
    QA must re-check: quality=medium/low water, runtime reflection-quality switches.
  - DONE: stage (23:15; lead spot-checked sheets/ba_overview.png ✔ — table + time-of-day backdrop, warm
    golden hour, lit night city). Perf variants `;legacylight;notable`. All 8 workstreams have final reports.
  - DONE: water fix round (23:40; lead checked fix/medlow_sheet.png ✔ — medium/low/nowaterrefl water correct
    at 11/18.2/20/21.5 h; dusk square = additive harbor-glows alpha in the reflection target, fixed).
  - DONE: people fix round (04:20). No agent is working any more; Phase 3 is lead-only.
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
* Phase-3 progress: 22:33–23:20 base side of the matrix done (8 chunks, clean reports). 23:41 new side started
  (qa_matrix.sh new; check each chunk's report.json failedModules — people may be mid-edit; redo such chunks).
  23:31 typecheck ✔ (clean). Build ✔: dist/index.html 2,597.7 kB vs baseline 2,202.4 kB (+395 kB, +18 %;
  legacy A/B copies ≈ 126 kB of source of that). file:// smoke test of the single file ✔ (overview 21.5 h:
  failedModules [], 0 errors/warnings, invariants {}, frameErrors []; shots/lead/dist_smoke.png).
  23:45 matrix sheets 11a/11b/18a built (scripts/agent-tools/qa_sheets.sh → shots/lead/qa/sheets/) and judged:
  11a ✔ 18a ✔ (consistent integration, no defects; 'ghost' ferris wheel was a downscale artefact —
  wheel_crop.png identical). New-side reports clean so far (failedModules [], 0 errors, invariants {}).
  23:50 FIX (lead, integration): balloon at cruise height cast a crisp dark blot over industry (stage's NW
  route + crisper shadows; shots/lead/qa/industry_air_ab.png). src/sim/ambient/vehicles.ts depth material:
  aircraft shadows fade out with height 12→40 m (dithered discard smoothed by PCF), barge always casts.
  Verified: shots/lead/qa/airshadow_check.png, 0 errors. ~23:50–03:00 usage-limit stop + container reboot;
  03:07 resumed (servers + autocheckpoint restarted, people resumed for its fix round). New-side matrix
  finished 00:00 (ALL DONE).
  03:10 ALL matrix sheets judged ✔ (11a/11b/18a/18b/21a/21b/06k/02k; all 16 chunk reports clean). Night set
  excellent; 2 h beach moon blowout of the ORIGINAL is gone; floodlit quay not clipped (max mean 203).
  Golden-hour forest yellow = warm light + birches, OK (station_forest18.png). Minor: one conifer near the
  station renders near-black at 11 and 18.2 h (vegetation crown AO?) — low priority.
  03:10 soak + ui-test started (scripts/agent-tools/qa_soak_ui.sh, resumable; log shots/lead/qa/soak_ui.log).
  Remaining: consolidated perf A/B = scripts/agent-tools/qa_perf.sh 1 then 2 (resumable; 4 views × new / ALL-legacy /
  per-feature toggles + original-build reference; out shots/lead/qa/perf/; start ONLY when people is done and
  soak/ui-test finished — machine must be quiet); legacy decision; final report.
  03:15 soak ✔ (4 min at 4×, full city): heap flat 285–291 MB (no leak), fps steady, 0 console/page/frame errors,
  failedModules []; ONE invariant sample at t=50 s: 2 pedestrians overlapping 3.2 s (couple 'act' vs elderly
  walking). Movement code unchanged by people (only stride/phase) ⇒ likely pre-existing crowd behaviour;
  base soak on 5174 queued to confirm (shots/lead/qa/soak_base.json). ui-test running since 03:15.
  04:00 base soak (5174): invariants {} in 4 min ⇒ the one overlap is inconclusive (rare event) — rerun longer
  soaks for both builds after the perf A/B. 03:58 ui-test full city (5173): 18 ok / 18 fail — every instant
  step passes (drag, pan, zoom, clamps, hover, click-follow + card, building framing, Esc, help, slider,
  speed), every time-based step fails (W/D/Q/R keys, POI flights, double-click flights, tour, chase, audio
  levels) + harness screenshot timeout ⇒ looks like SwiftShader full-city slowness (~10 fps) vs the test's
  time windows. Cross-check running (scripts/agent-tools/qa_ui2.sh; ui-test.mjs got --url): (1) new build,
  default stand-in city; (2) ORIGINAL build, full city. 04:20 people fix round DONE (corners median
  6.3→1.8 cm, max 61→11 cm; garbage 2.1 KB→2 B bench / 50–140 B in Chrome; trousers + toe box; sheet ✔).
  ALL agent work complete.
  04:12 ui-test DEFAULT mode (stand-in city, new build): 34 ok / 1 fail ('kinds': bus framing + no pedestrian
  on screen in the stand-in city) ⇒ camera/UI logic works. ~04:15–04:42 container reclaimed AGAIN (no agent
  running ⇒ idle session ⇒ reclaim kills setsid jobs). LESSON: run long lead jobs as harness-tracked
  background Bash tasks (run_in_background, ≤ 2 h each). 04:43 restarted; running (tracked): ui-test on the
  ORIGINAL — default mode (uitest_default_base.json) then full city (uitest_full_base.json). Then perf A/B.
  05:07 ui-test verdict ✔ NO REGRESSION: default mode identical (new 34/35 = base 34/35, same step); full city
  the original fails the same time-based steps under SwiftShader (base 23/40, new 18/36 incl. a harness
  screenshot timeout); only diff 'T starts the auto-tour' = flaky 1.5 s window: probe
  (scripts/agent-tools/qa_tourprobe.mjs) shows the tour identical on both builds (same slow opening orbit
  ~0.1–0.4°/2 s at ~12 fps, same 'Tinyhaven' caption). 05:25 perf A/B rep 1 started (tracked).
  Perf rep 1 (SwiftShader, relative only; shots/lead/qa/perf/1_*.json): downtown 12 h new 506 ms vs all-legacy
  321; legacylight&notable alone 257 (?!) ⇒ stage lighting/table suspect; harbour 21.5 h new 341 vs
  nowaterrefl 154 (consistent across the 5 variants ⇒ reflection ≈ 2× in SwiftShader although the pass is
  only ~140k tris at 1/3 res and the water shader adds 3 taps). Page-to-page noise is large ⇒ next:
  in-page runtime A/B probe (scripts/agent-tools/qa_toggleprobe.mjs --probe refl|light|table|veg|vegcheap)
  and round 2 with alternating variants (scripts/agent-tools/qa_perf2.sh), both after rep 1 ends.
  06:00 rep 1 done. Original build (5174) vs new, same views, SwiftShader ms/frame: downtown 199→506, westbrook
  177→438, overview 718→1087, harbour 21.5 h 241→341 (draw calls +7–9, tris +15–20 %). In-page probe:
  reflections on/off at harbour 21.5 h 932/509 ms (+83 %). Pass probe (qa_passprobe.mjs): JS time per frame
  main render 12.4 ms + reflection 2.0 ms of a 181 ms frame ⇒ the rest is SwiftShader raster (CPU-emulated
  fragment work, half-float targets, mip generation). CONCLUSION: SwiftShader cannot measure GPU cost; the CPU
  side is small. Report must say so + give the user exact perf.mjs commands for the Adreno. Round-2 page A/B
  skipped (noise, not representative); in-page probes for light/table/veg/vegcheap running for a ranking.
  06:30 in-page probes unusable after round 1 (runtime toggles recompile shaders ⇒ 4–17 s SwiftShader stalls).
  Round-1 signals only: overview table on/off 804/184 ms, downtown light on/off 342/196 ms ⇒ the table (a PBR +
  shadowed surface over up to half the screen where the void was) is the largest SwiftShader-visible add after
  reflections; GPU estimate 0.2–0.5 ms — to be verified on the Adreno. Attribution stopped here (limits stated).
  LEGACY DECISION: keep all legacy toggles/copies for now — they are the user's one-build A/B for the real-GPU
  measurement (~100 kB bundle, zero runtime cost unless switched); strip in a follow-up after measuring.
  06:32 8-min soaks of new + original running (tracked) for the pedestrian-overlap question.
  07:01 8-min soaks: the overlap hit is identical on the ORIGINAL (pre-existing); new build also had one
  'pedestrian inside a building' at t=300 s — movement code + plan data unchanged, runs diverge via
  frame-time sub-stepping ⇒ pre-existing crowd edge case; listed as a follow-up in GFX-REPORT.md.
  07:05 Phase 3 complete. Final report: docs/progress/GFX-REPORT.md.

## History
* 2026-10-19 (after the overhaul) — user feedback: the camera felt jumpy. Free camera is now the default
  (src/ui/camera.ts): plain orbit with no spring-arm / line-of-sight / roof-lift / escape rules (only the
  ground stops it), min distance 3 m and pitch 2°, pan follows the ground (no roof riding), no idle
  auto-tour. G (or ?guidedcam) restores the guided camera; remembered in localStorage. Follow cams, flights
  and the tour keep their framing. ui-test pins ?guidedcam for its contract steps + new 'freecam' step
  (default mode 35/36, same pre-existing 'kinds' step as the original).
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
