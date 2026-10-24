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
* 2026-10-24 03:33 UTC — 4th stop = WEEKLY limit: agents resumed 2026-10-20 07:31 hit it at once (no agent
  edits since 02:08 on 10-20; logs' Resume here are from ~02:05). Limit reset 10-24 03:00; container rebooted
  ~03:30. Restored: servers 5173/5174, autocheckpoint 20 min, locks cleared, tree clean at 582500f (pushed);
  44+48+4 queued watchdog firings drained. All 7 agents resumed 03:33 with their open lead notes repeated.
  Lead next: judge integration capture shots/world/lead/int1 (if it survived; else re-run) vs critique/a,
  before/after sheet for the user.
* 03:40 — int1 judged (sheets shots/world/lead/int1_sheet_a.png 18.2 vs 18.2, _b.png street views 11 vs 18.2;
  code of 10-20 07:30). ✓ frame solved: horizon, landscape, mountains, sea; park_low reads as a real park
  (flowering tree, meadow, leafy crowns); old town lived-in (laundry, AC units, cobbles); dt_street grittier.
  ✗ (a) 18.2 reads grey/overcast + dim in every city view — warm sunlit facades of "before" lost → air top item;
  (b) farmland beside the beach in the hero overview = flat ochre rectangles + empty pasture → world;
  (c) wide tan ribbon across the old-town street (ot_street) → life (cord width?); (d) street trees near-black
  in shade, leaf cards huge/flat when the camera is inside a crown → foliage; (e) life FAILED to load in int1
  (Drift.initInsects null setColorAt; mid-edit) → life to confirm. Perf note: 165–184 draw calls, 2.3–2.8 M
  triangles in full-city views (target ≈145 calls) — final perf pass must address. My view presets to fix:
  river_low (inside a tree) and wb_street (clips a roof).
* 2026-10-20 07:31 UTC — 3rd usage-limit stop (agents stopped ~02:30, reset 06:30; container rebooted ~07:28).
  Restored, tree clean at 9c3dc05; all 7 agents resumed 07:31. Lead running integration capture
  shots/world/lead/int1 (the 12 critique views at 18.2 h, full city) for a before/after vs critique/a.
  Since 01:31: wear M2 (old town eye level, roofs, shops, puddles, terrace night lights) done; streetlife M2–M4
  (riders, plaza life, vendors, rounder cars) done → car paint gloss pending; ground pond verified, foliage removed
  its pond reeds; air golden-hour rework (two-medium in-scatter, raymarched clouds) → cloud artefacts + long
  shadows pending; world M3 (country roads, herds, tractor, villages, far land) done; POIs final: overview
  d640/p13, coast (230,3,−40), riverbend (−300,1,118). Lesson: when a stop says "resets HH:MM", schedule a
  one-shot wake (send_later) for HH:MM+3 min — hourly watchdog firings during the limit cannot act.
* 2026-10-20 01:31 UTC — 2nd usage-limit stop: all agents stopped ~21:30 (reset 01:20); watchdog firings
  21:29–00:29 could not act (session also limited); container rebooted ~01:29. Restored servers/autocheckpoint/
  locks; tree clean at dc885c7 (pushed). All 7 agents resumed 01:31. State at stop: world M2 done (countryside,
  villages, island, reflection proxies) + M3 roads/portals/country traffic in progress; air two-component haze +
  cumulus/cirrus rework (verifying); ground M1 done (blades, meadows, reeds, lilies, 96 m outer band; pond
  doubles → foliage removal pending ground's confirmation); foliage M1 leaf cards + palm bark (judging); streetlife
  M1+M2 done, M3 (plaza groups, vendor carts, fountain sitters) capturing; market vendors grant (civic.ts);
  life M2 bunting/festoons verified, smoke visibility issue in SwiftShader; wear M2–M7 coded, not yet judged.
  World POIs added in plan.ts (overview d600/p20, vista, country, coast, riverbend).
* 2026-10-19 20:50 UTC — container restarted again ~20:49 (agents + all background captures killed). Restored:
  servers, autocheckpoint, locks cleared; 17 uncommitted agent edits survived on disk. All 7 agents resumed via
  SendMessage 20:51. Earlier today: streetlife M1 (café parties, 31 terraces/94 seats, waiters, tableware) done;
  pedestrians.near() live; review notes sent (streetlife density, wear plaza/shop interiors, foliage palm trunk).
* 2026-10-19 20:30 UTC — account usage limit stopped ALL agents ~17:30 (reset 20:00); container rebooted ~20:29.
  Watchdog: tree clean + pushed (fe25a85), servers + autocheckpoint restarted, stale shot locks cleared, all 7
  agents resumed via SendMessage at 20:31 (each from its log's Resume here). State then: world M1 (landscape,
  sea/river extension, camera far/FOV) iterating; air M1 atmosphere in tree; ground M1 blades rendering; foliage M1
  leaf cards (wood shader fix pending); streetlife M1 café parties mid-edit (crowd.ts); life M1 cloth/decor;
  wear M1 done → M2 balcony greenery.
* 2026-10-19 16:45 UTC — watchdog: 7 agents running. wear M1 DONE (ctx.services.buildings / props live;
  relayed to life + streetlife). air M1 code written (render/atmosphere.ts, sky/atmoDrive.ts). foliage M1 code
  written (atlas/foliage/crowns). ground: groundcover blade rings wired, first capture running (its terrain
  shader break fixed). world/streetlife/life: coding M1 (logs not updated since ~15:25). Push flaky (proxy).
* 2026-10-19 15:58 UTC — watchdog check: all 7 agents running (surveys + logs done; before-captures / M1 in
  progress; first code: wear services, foliage atlas/cards, life decor, air dome). GitHub push was failing
  ~15:00–15:55 (proxy tunnel to github.com: handshake timeouts, 502); pushed OK at 15:57 (cb5bc25). Requests
  relayed 15:10: life→wear (anchors, laundry ends, roof vents, bbqs/washing), streetlife→wear (cafes, discs,
  sidewalk cafés), life→streetlife (pedestrians.near), life→air (postfx.softDepth).
* 2026-10-19 14:45 UTC — Critique done (below). Plan: `WORLD-PLAN.md` (binding), briefs: `world-briefs.md`.
  7 agents launched ~14:40 (ids under "Agents"). Second user reference received mid-turn (Tel-Aviv café
  street, "even more alive and realistic than this") → streetlife workstream + wear priorities.
  Lead next: relay cross-agent requests (wear → buildings/props services for life + streetlife; world ↔ air
  horizon; ground ↔ foliage reeds; air adaptive setters), judge milestone shots, set hero POIs (plan.ts)
  once the landscape exists, put the high-tier perf price (≈ +6 ms est.) to the user. Watchdog
  `trig_01Dosn8CiDr2iqF7HZGRccm3` (hourly :29), autocheckpoint every 20 min (setsid loop).

## Machine restore (fresh container)
```bash
cd /home/user/GameCity && git fetch origin claude/pensive-gates-bim12i && git status
npm ci
[ -d /home/user/GameCity-baseline ] || { git worktree add --detach /home/user/GameCity-baseline 9de79e9 && ln -s /home/user/GameCity/node_modules /home/user/GameCity-baseline/node_modules; }
mkdir -p shots/tools && cp scripts/agent-tools/servers.sh shots/ && cp scripts/agent-tools/{checkpoint.sh,autocheckpoint.sh,sheet.py} shots/tools/
shots/servers.sh        # 5173 working tree, 5174 baseline
```
Scripts need no GPU (SwiftShader fallback); prefix with `TH_LOCK_SLOTS=2`.

## Critique (2026-10-19, captures: shots/world/critique/a/*.png — 12 views × 11 h / 18.2 h, 1600×900)

Reference: golden hour; four depth layers (dense flowering meadow foreground → village → layered conifer
forest → mountains) separated by warm/blue aerial haze; every surface is busy with organic detail (grass
blades, flowers, reeds, foliage edges, weathered walls); life cues everywhere (smoke, flag lines, wind in the
grass, reflections). Tinyhaven today, honestly:

1. **The frame IS the toy (biggest gap).** Every view above street level shows the slab on a plinth on an
   oak table, the soil cross-section, a wooden frame where the sea ends (beach_11), cotton-ball clouds hovering
   over the table (overview_18h2) and tilt-shift blur. There is no horizon, no sky in frame, no land beyond the
   city, so there is no depth layering and no atmosphere — the two strongest "real place" cues in the
   reference. No amount of detail inside the slab can make a model on a table read as a world.
   → Answer to "does the diorama frame serve the goal?": **no**. Default becomes a world that continues to
   the horizon; the diorama stays available as an optional mode (`?diorama`), not deleted.
2. **Ground = flat paint.** Lawns, verges, riverbanks and park are one flat lime-green felt (park_11,
   riverside_11; at street level park_low_11 it is a green floor). No grass, no meadow, no flowers in the
   grass, no weeds at walls/kerbs/fences, no leaf litter, no worn earth. This is the reference's whole
   foreground and it is missing entirely.
3. **Trees = smooth faceted blobs.** At distance lollipops in rows; at street level (ot_street_11,
   river_low_11) giant faceted green polyhedra. No leaves, no gaps, no branches, no undergrowth.
4. **No air.** Fog starts ~800 m from the camera, so a tower at 500 m has the same contrast and saturation
   as a car at 20 m. Golden hour is a colour tint on a table; the sun, its glow and the sky never appear.
   Candy-saturated pastel palette (lime grass, toy red roofs) reads as painted plastic.
5. **Too clean.** Pristine asphalt and concrete, plazas with nothing on them, uniform roofs, flat facades
   (dt_street_11), canal of clean stone walls with no plants at the waterline. Nothing is old, used or
   repaired.
6. **Life is thin and mechanical.** Traffic and walkers exist, but the wind is a constant vector (nothing
   gusts), smoke only from ships/industry (no chimneys in a town of houses), nothing flutters (no flags,
   laundry, bunting, awnings), no birds over the roofs in most views, no "things happening" in gardens or
   on balconies.

Not the gap: the building and street layout (dense, readable), people figures (good at city distance),
night lighting (strong). Layout regularity (orthogonal grid) is a secondary toy cue — mitigated by organic
cover (trees overhanging, unmown edges, irregular gardens) rather than re-planning the city.

## Plan
See `WORLD-PLAN.md` (workstreams ranked by gap: world, air, ground, foliage, streetlife, life, wear; ownership,
contracts, art direction, budgets, testing, logging). Lead-side contracts done: `src/core/wind.ts` (shared wind
field, updated per frame in main.ts), `src/core/world.ts` (`DIORAMA` via `?diorama`), stub modules landscape /
groundcover / life registered in main.ts.

Rule-break proposal for the user (not silent): the full vision on **high** is estimated at ≈ +6 ms GPU on the
Adreno at 1920×1025 (old rule: ≤ +2 ms for new work). Built as quality tiers (medium ≤ +2 ms, low ≤ +0.5 ms) with
a URL switch per feature, so the user decides after measuring on the real GPU.

## Agents (launched 2026-10-19 ~14:40 UTC; resume with SendMessage by id, or respawn from world-briefs.md)
| agent | id | log |
|---|---|---|
| world | a1ae2952c87afea00 | world-world.md |
| air | afa484aa1f5b0fe9d | world-air.md |
| ground | a7357a9a5f8ec4dd2 | world-ground.md |
| foliage | a9a7f496024b731c0 | world-foliage.md |
| streetlife | adc3e786bf6ae6688 | world-streetlife.md |
| life | a47266d2b0f89bfcd | world-life.md |
| wear | aef3c345a9e493659 | world-wear.md |
Research agent (done): docs/progress/world-research.md.

## Log
