# Next round: method notes (lead, 2026-10-28)

Written after the "world" round (see WORLD.md) for whoever leads the next one. The goal is a world that is
**physically real**: every thing must stop reading as a geometric primitive and become a convincing object.
Light, shadow, reflections and atmosphere are deliberately out of scope this round (user, 2026-10-28). It should cost **far fewer tokens**,
and it must lose **nothing** in quality or frame rate. The savings come from how the work is organised, never
from doing less, judging less or accepting worse.

## Where the tokens went in the world round (measured)

Measured from the round's transcripts with `scripts/agent-tools/tokens.py` (weights in input-price units: input 1,
cache write 1.25, cache read 0.1, output 5). Total ≈ 299M weighted:

| | share |
|---|---|
| cache reads (the whole context re-read on every call) | 51% |
| cache writes | 46% |
| output (including thinking) | 3% |

Who spent it: world 16%, ground 14%, foliage 13%, life 12%, lead 11%, wear 11%, air 10%, streetlife 8%,
QA 4%. Median context per call was 360–540k for the agents and 424k for the lead; maxima reached ~780k.

**1. Cold rewrites: 42% of everything (221 calls, 126M).**
- The prompt cache of a subagent lives about **5 minutes**; the lead's (a main session) lives **1 hour**.
  - Measured: after an idle gap over 5 min, subagent calls were cold 209 times and warm 12 times.
  - The lead after the same gaps was warm 35 times; its 7 cold calls all followed gaps over an hour.
- A cold call re-writes the whole context at 1.25 instead of 0.1: one wait on a 500k context costs about 625k,
  as much as 12 warm calls.
- **32%: agents blocked on long commands.**
  - 165 calls: captures, and `until … ; sleep` loops waiting for background captures.
  - Captures took a median of **9 min**, because seven agents shared **4 CPUs** with software GL (load average 13).
- **9%: resuming giant contexts after usage stops.** 51 calls, median gap 4 h.

**2. What the context was made of** (lifetime cost: a token is paid again on every later call while it stays in
context):

| content | share |
|---|---|
| code read through Bash (`cat`, `sed -n`, `grep`) | 24% |
| code read through Read | 4% |
| the agent's own edits and text (Edit/Write inputs stay in context) | 18% |
| thinking, which stays in context | 15% |
| per-call overhead (reminders, tool wrappers; ~320 tokens per call) | 11% |
| system prompt + brief | 9% |
| images | 6% |
| compaction summaries | 5% |
| output generation | 3% |
| script reports (capture/perf JSON) | 1.5% |

Calibration: tool text ≈ 2.1 chars/token; an image ≈ 1,300 tokens.

**3. The lead: 11%.** 649 real calls. Its turns were triggered by:
- 399 task notifications;
- 41 stop-hook "uncommitted changes" turns caused by agents' live edits;
- 40 agent messages;
- 24 user messages.

One `ReadNotifications` dumped ~60k tokens of repeated watchdog prompts.

**4. Quality cost of the same method.**
- A silent regression (ground-cover maps unplugged for 11 h) went unnoticed, because nothing compared images
  over time.
- Viewpoint-bound reviews missed bugs that the user found in minutes with the free camera:
  - a bus shelter built backwards;
  - fields cut diagonally;
  - egg-carton domes on the forest floor;
  - a sea seam.

## Review of the first draft of these notes (what the data corrected)

The first version, written before measuring, got the direction right but the weights wrong:

- **Right: giant contexts are the core problem.**
  - Cache reads plus cold rewrites of 400–800k contexts are ~90% of the cost.
  - Short-lived agents remain rule 1.
- **Missed entirely: the 5-minute cache TTL of subagents.**
  - Waiting is the single biggest waste (42%).
  - Its root cause is slow captures on a shared, overloaded CPU.
  - So the fixes are *fast captures, separate CPUs and no long waits inside an agent*. Fewer images or terser
    logs do not touch it.
- **Wrong: "the lead's context is the most expensive in the system."**
  - The lead's context is about as large as the agents' (median 424k), but it costs only 11%: its 1-hour TTL
    makes its waits cheap.
  - Lead savings (fewer notification and hook turns) are real but secondary.
- **Overrated: images.**
  - They are 6% of the cost.
  - Do not lower resolution or skip looking to save tokens. Contact sheets are for better judgment (side by
    side), not for savings.
  - The lead MAY look at milestone sheets; final integration judgment stays with it.
- **Underrated:**
  - Code reading (28%) and the agent's own edits (18%) carried for hundreds of calls.
  - Per-call overhead (11%), which shrinks when independent tool calls are batched in one response.
- **The saving estimate drops from ~70% to ~55–65% for the same work.** The model:
  - agent cache reads 125M → ~40M with contexts kept near 150k;
  - cold rewrites 126M → ~20M (smaller contexts and almost no waits over 5 min);
  - +10–15M for extra spawns and re-reading;
  - lead 34M → ~20M.

  Check it with `tokens.py` after the first wave.

## Token rules (ranked by measured weight; each keeps quality whole)

1. **Never wait over ~4 minutes inside an agent (attacks the 42%).**
   - A capture that blocks longer than the cache TTL re-sends the whole context.
   - Iterate on the **object bench**: `only=` subsets, one page load, several distances, day/night in one sheet.
     It runs in well under 4 min.
   - Split anything longer, or start it in the background and keep working on code meanwhile.
   - No `until …; sleep` wait loops.
   - Before a long run (full-city set, perf, soak): write the log first, end the milestone, and let a fresh
     agent read the result.
   - *Quality:* the same images get judged; only the waiting moves.
2. **Give heavy workers their own CPU.**
   - Seven agents on 4 shared cores turned 1-minute captures into 9-minute ones. That cost both tokens and
     wall-clock time.
   - Preferred: run each workstream as a **sibling cloud session** (`create_session`, own branch). It gets its
     own container, CPU, dev server and git tree, so there is no stop-hook churn and no mid-edit cross-breakage.
   - A main session also probably has the 1-hour cache. Verify in wave 1: `tokens.py` in the worker shows
     "idle>5min warm/cold".
   - Workers report to the lead with `send_message` at milestones. The lead merges branches.
   - Fallback (subagents in one container): at most 3 capture-heavy agents at once, each in its own git worktree
     with its own dev-server port.
3. **Short-lived agents (attacks the 51% reads and the size of every rewrite).**
   - One agent = one milestone. End it when its context nears ~150–200k.
   - It ends by writing its log:
     - "Resume here";
     - result;
     - **what was tried and rejected, and why**;
     - the reference sheet path;
     - the next step.
   - The next milestone is a NEW agent spawned from the brief plus that log.
   - After a usage stop, respawn from the logs; never resume a large transcript.
   - *Quality:* the log carries the decisions, and a fresh agent is not anchored on its earlier choices.
4. **Read and write lean (attacks the 28% + 18% content).**
   - `grep -n` first, then targeted ranges.
   - Never re-read a file you just edited.
   - Small `Edit` hunks instead of re-writing whole files with `Write`.
   - Don't print diffs or whole files to "check".
   - Batch independent tool calls in one response: fewer calls means less overhead and fewer full-context reads.
   - Scripts print a terse summary (errors, failed modules, invariant counts, sheet path); JSON goes to a file.
5. **One close-up audit instead of surveys.** The round starts with the audit:
   - every object class at 2 / 10 / 40 m;
   - ranked by screen presence × how primitive it reads;
   - with code pointers.

   That, plus ARCHITECTURE.md and the relevant log, is each agent's briefing.
6. **Acceptance criteria up front, judged by a fresh reviewer.**
   - Each object class gets a "photo test": what a real one has at 3 m, at 10 m and from the overview.
   - A short-lived reviewer agent (fresh context, the sheets, the checklist, the art bar and history from the
     logs) returns ALL notes at once.
   - *Quality:* higher than now, because there is no anchoring and no drip-fed note → fix → capture loops.
7. **Catch regressions and bugs by machine, early.**
   - A golden-view image diff at every milestone.
   - Placement invariants in code: furniture faces its road or table, nothing on road cells, no tree inside a
     footprint, nothing floats.
   - A seeded free-camera sweep reviewed by a fresh bug-hunter at the end of every wave.
8. **A quiet lead.**
   - Agents talk through files (`docs/progress/requests.md`, contracts in the plan) and report only at
     milestones.
   - Agents commit their own paths, so no stop-hook rounds.
   - The watchdog runs a one-line prompt in a fresh session and pokes the lead only if something stalled.
   - When a stop says "resets HH:MM", add one wake at HH:MM + 3.
9. **Waves of 3–4 workstreams**, highest impact first. Same total work, less contention and coordination.
10. **Right model per job (minor).**
    - A cheaper model only for purely mechanical work (running a capture list, building sheets).
    - Art judgment, shaders, review and bug-hunting stay on the strongest model.
11. **Measure every wave.**
    - Run `python3 scripts/agent-tools/tokens.py` (in each worker session too) and record the summary in the log.
    - Targets: median context ≤ 150k; cold rewrites ≤ 10% of cost; no agent blocked > 5 min.
    - The user's Adreno numbers (`perf-results.txt`) are the frame budget.

## Making the world physically real: principles to give the agents

The world round fixed the frame, light, atmosphere and organic cover. What still breaks the illusion is the
**things themselves at street distance**:
- boxes and cylinders instead of objects;
- wrong proportions;
- flat colour instead of material;
- perfect repeats;
- things that hover or sink.

**Scope (user, 2026-10-28): physical detail first.**
- Out of scope this round, to be handled in a later one:
  - lighting;
  - shadows;
  - reflections;
  - fog/atmosphere;
  - the sky;
  - post-processing and grading.
- Touch them only when an object change needs it, e.g. a new material that must respond correctly to the
  existing light.
- Judge objects in plain daylight. Night is a regression check only.

Work each class through this ladder, most visible first:

1. **Form and proportion.**
   - Real dimensions, checked against the real thing.
   - Break the silhouette into its parts.
   - Bevel visible edges: baked into merged geometry, nearly free.
2. **Construction.** How the thing is really built and held together:
   - frames with depth, joints, fixings, hinges;
   - sills, cornices, gutters and downpipes;
   - kerb stones, wheel arches, bolts on a lamp base.
3. **Material as a physical surface.**
   - Per family (plaster, brick, stone, wood, painted metal, rust, glass, rubber, fabric, asphalt), one shared
     shader chunk with boot-time procedural relief (normal, roughness), courses and grain, and wear where use
     and weather put it (edges, handles, the foot of a wall).
   - A near-only fade, so a single chunk lifts hundreds of objects.
4. **Contact.** Everything rests, leans, is anchored or settles a little:
   - dirt and damp at the base;
   - contact darkening where things meet the ground and each other.
   - Nothing hovers or clips.
5. **Signs of life, near LOD only.** The small things people use and leave:
   - On buildings: handles, letterboxes, house numbers, curtains, pots on sills, cables, legible signage.
   - On streets: bikes, bins, crates, bollards, manholes.
   - On vehicles: tread, hubs, plates, mirrors.
   - On people: faces, hands, clothing folds, carried things.
6. **Variation.** No two neighbours identical: tint, wear, small geometric variants, state (open / closed).
7. **Mechanics.** Whatever moves in reality moves correctly:
   - wheels turn; cars pitch when braking;
   - doors and shutters open;
   - awnings and parasols move with the shared wind;
   - people walk with weight and gesture.
8. **Dense real places.** A few spots where the density of real things makes people stop, each verified like
   a POI:
   - the market;
   - the harbour quay (ropes, bollards, nets, crates);
   - a café terrace;
   - a back yard or alley;
   - a building site;
   - the station platform.

**Performance shape:**
- detail lives near the camera (instancing, merged geometry, distance LOD);
- shader detail instead of triangles where it reads the same;
- no per-frame allocations;
- every feature has a quality tier and a URL toggle.

## Open items carried over

- Sheep look faceted under 5 m.
- Flower heads are crude under 2 m.
- Reeds are missing from the water reflection.
- Awnings and parasols are static.
- Petals fall from every tree.
- The pre-existing bus rear-axle glitch at (58.7, −68.6) is still there.
- Shader hedges between plots have no gaps.
- The free camera can enter buildings (guided mode keeps out).
- The 10-28 bug-fix pass is recorded in WORLD.md under "Resume here".
- From the 10-28 pass:
  - The instanced forest now reaches 800 m (31.4k trees, was 21k). It was not measured on the Adreno; check it
    in `perf-results.txt` or with `?quality=`.
  - A < 1 m earth sliver remains at the rock foot beside each road-tunnel wing wall. Fix: end the front dig at
    reach + 0.8 (terrain/height.ts applyPortal).
  - The landscape copies the grass-blade fade radii per tier from groundcover/field.ts. An exported getter in
    terrain/ground.ts would make them exact.
  - Lamps that had no room beside a driveway were dropped (1 in Westbrook).
