# Next round: method notes (lead, 2026-10-28)

Written after the "world" round (see WORLD.md) for whoever leads the next one. The goal is a much stronger
"wow" from **detail**: things must stop reading as geometric primitives. It should cost **far fewer tokens**,
and it must lose **nothing** in quality or frame rate. The savings come from how the work is organised, never
from doing less, judging less or accepting worse.

## Where the tokens went in the world round

Seven agents ran in parallel with one lead, and seven usage stops (session and weekly limits) cut the work.
The tokens went mostly to things that added no quality:

1. **Giant contexts re-sent every turn.** Agents grew to 300–770k-token transcripts. Every later step, and
   every resume after a stop (cold cache), paid for that history again.
2. **The lead's context.** It is the largest and the most expensive in the system, and it took a turn for
   every agent message and every relay. On top of that it re-read images to judge them, answered hourly
   watchdog wake-ups that found nothing wrong, and handled ~25 stop-hook "uncommitted changes" rounds caused
   by agents' live edits.
3. **Surveys.** Every agent re-read large parts of the code before starting.
4. **Images and logs.**
   - Folders of single PNGs were read instead of one contact sheet.
   - Full-resolution frames were read where a crop would do.
   - Verbose JSON reports were printed into contexts.
   - Agents ran full-city captures for small changes.
5. **Drip-fed reviews.** A note, a fix, a capture, then a new note found only now. Each loop is a full
   capture-and-review cycle.
6. **Finding problems late.**
   - A silent regression (ground cover maps unplugged for 11 h) slipped through, because nothing compared
     images over time.
   - Bugs the user found in minutes in free camera were missed by every viewpoint-bound review: a bus shelter
     built backwards since the start, fields cut diagonally, egg-carton domes on the forest floor, a sea seam.
     The rework after the fact costs more than catching them would have.

## Token rules (each one cuts cost without touching quality)

1. **Short-lived agents.** One agent = one milestone (≤ ~2 h). It ends by writing its log: "Resume here",
   result, next step. The next milestone is a NEW agent spawned from the brief plus that log. Never resume a
   transcript past ~200k tokens. After a usage stop, always respawn from the logs; never resume.
   *Quality:* none lost, because the log carries everything that matters, and a fresh agent is not anchored on
   its own earlier choices.
2. **A lean lead.** The lead orchestrates and decides; it does not look at images.
   - Milestone judgment goes to a short-lived **reviewer agent**. It gets a fresh context, the sheets, the
     acceptance checklist and real-world reference descriptions, and returns a written verdict with ALL notes
     at once. The lead reads text.
   - Agents report only at milestones and talk to each other through files: `docs/progress/requests.md` for
     requests, contracts in the plan. The lead only resolves conflicts.
   *Quality:* better than now. Fresh eyes judge with no anchoring, and nothing is drip-fed.
3. **No surveys.** The round starts with one **close-up audit**: every object class at 2 / 10 / 40 m, ranked by
   screen presence × how primitive it reads, with code pointers per class. That plus ARCHITECTURE.md is every
   agent's briefing. Agents read only the files they will change, using `grep -n` and targeted ranges.
4. **Cheap, sharp eyes.**
   - Iterate on an **object bench**: one page load renders the class being worked on at fixed distances, day
     and night, into one contact sheet, with `only=` subsets at 960×540.
   - Read sheets and full-resolution crops of the area in question.
   - The lead runs full-city sets, and only at milestones.
   - Every script prints a terse summary by default: errors, failed modules and invariant counts, the sheet
     path. The JSON goes to a file.
5. **Acceptance criteria up front.** Each object class gets a short "photo test" checklist before work starts:
   what a real one has at 3 m, at 10 m and from the overview. Agents build to it, and the reviewer gives one
   complete list. That means fewer loops for the same or higher bar.
6. **Catch regressions and bugs by machine, early.**
   - A golden-view image diff runs at every milestone.
   - Placement invariants live in code: furniture faces its road or table, nothing sits on road cells, no tree
     stands inside a footprint, nothing floats.
   - A seeded free-camera sweep goes to a fresh bug-hunter agent at the end of every wave.
   Problems get found the day they're made, by a cheap check instead of the user.
7. **Fewer wake-ups.**
   - The watchdog fires into a fresh small session that checks state from files, and pokes the lead only if
     something stalled. When a stop says "resets HH:MM", add a one-shot wake at HH:MM + 3.
   - Agents commit their own paths at each milestone, which keeps the tree clean. The 20-minute
     auto-checkpoint stays as the safety net.
8. **Waves, not a swarm.** At most 3–4 agents at a time, on independent object families, highest impact
   first. Same total work, far less coordination traffic, and fewer agents caught mid-step by a stop.
9. **Right model per job.**
   - Mechanical work (running captures, building sheets, data probes, sweeps) can run on a cheaper model.
   - Art judgment, shader work and review stay on the strongest model.
10. **Real numbers first.** Use the user's Adreno measurements (`perf-results.txt`) as the budget. They prevent
    building expensive features that later have to be cut.

## Getting "wow" from detail: principles to give the agents

The world round fixed the frame, light, atmosphere and organic cover. What still breaks the illusion is the
**object level at street distance**:
- boxes and cylinders;
- flat colours;
- perfect repeats;
- things that don't touch the ground.

Work each class through this ladder, cheapest and most visible first:

1. **Silhouette.** Break boxes with sub-parts (sills, cornices, frames with depth, gutters, wheel arches),
   and bevel every visible edge so it catches light (baked into merged geometry, nearly free).
2. **Material.** For each material family (plaster, brick, stone, wood, painted metal, glass, rubber, fabric,
   asphalt), one shared shader chunk with boot-time procedural detail (normal and roughness), an edge-wear
   term and a near-only fade. A single chunk lifts hundreds of objects.
3. **Grounding.** Contact darkening and vertex AO where things meet the ground and each other; damp and dirt
   at the base. Nothing hovers.
4. **Human-scale parts, near LOD only.**
   - On buildings: handles, hinges, house numbers, letterboxes, curtains, plants on sills, drainpipes,
     cables, legible signage.
   - On vehicles: tyre tread, hubs, number plates, mirrors.
   - On people: faces, hands, clothing folds.
5. **Variation.** No two neighbours identical: tint, wear, small geometric variants, state (open / closed,
   lit / unlit).
6. **Motion.** Whatever moves in reality moves here:
   - wheels turn, and cars pitch when they brake;
   - doors, windows and shutters open;
   - awnings, parasols and signs sway with the shared wind;
   - people turn their heads and gesture.
7. **Hero moments.** A few scenes worth stopping for, each a place and time verified like a POI:
   - a rainy night street with reflections;
   - the morning market setting up;
   - sunset over the harbour;
   - a train crossing the bridge at dusk.

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
