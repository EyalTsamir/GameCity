# First-person walk (FPV) — progress log

## Resume here
Feature complete and committed; typecheck clean, `vite build` OK. Remaining = verification only:
1. scenario probe (footbridge arch, pier, beach waterline, harbour quay edge, park, off the slab west) — script
   `<scratchpad>/uit/scripts/scen.mjs` (screenshots → shots/fpv/s_*.png); fix whatever it shows.
2. perf A/B at street view `5,1.5,-65,9,0,6` @12, 1536x820@1.25: `<scratchpad>/uit/scripts/abperf.mjs` (baseline =
   `git archive 024d901` copy served on :5193 with node_modules junctioned + its own cacheDir; this branch on :5183).
3. full default ui-test (`--q camdebug`, includes `walk`) via `<scratchpad>/uit/run.sh` (a copy of ui-test.mjs importing
   the main checkout's browser.mjs → shared lock). Then final Hebrew report (controls, coverage, limits, files).
If the scratchpad is gone: recreate the copy with `sed "s#from './browser.mjs'#from 'file:///C:/Projects/GameCity/scripts/browser.mjs'#"`.
Ground heights come from `ctx.services.terrain.height` (keep it that way: sibling `places-between` adds stairs/ramps there).

Branch `claude/fpv-walk-58aa99` (worktree `.claude/worktrees/fpv-walk-58aa99`), cut from `claude/pensive-gates-bim12i`
at 024d901. One of three parallel sessions (perf quick wins, explore orbit camera, this walk mode); the coordinating
session merges all three into `claude/pensive-gates-bim12i`. Brief: walk around Tinyhaven as a person — no gameplay.

## What it is
* **V** (walks from the spot under the cursor) or the toolbar's walking-figure button (walks from the camera focus)
  glides down to eye level (1.65 m) at the nearest place a person can stand (sidewalks / paths preferred over the
  carriageway, 60 m search). V again, or Esc when the mouse is free, glides back up to the orbit camera from exactly
  the eye pose (no jump). Places / minimap / tour / following leave the walk first.
* W A S D walk (1.4 m/s), Shift jogs (3.4 m/s); ↑↓ walk, ←→ and Q E turn, R F look up / down.
* Mouse: entering by key / button captures the mouse (pointer lock: mouse = look, a click inspects what is under the
  centre dot, Esc frees it). Free mouse: drag to look ("grab the view": the point under the cursor stays under it),
  click a thing → its info card ("Looking at · …"; Esc / the card's close button closes it, the walk goes on), click
  empty space → capture the mouse again. C with a card open leaves the walk and chases that thing.
* Touch: left third of the screen = thumb stick (full deflection jogs), drag elsewhere to look, tap = info card.
* Feet follow the walking surface with a critically damped step (up ω22, down ω15); head bob ≤ 2.2 cm walking /
  4.8 cm jogging + a little sway; one `walk:step` event per footfall → synthesized footsteps (paving / deck / grass /
  sand) in the audio module when sound is on.
* Lens: FOV 66° (74° on portrait screens), near 0.2 m, body radius 0.42 m (the near plane's corners never reach a flat
  wall). The CameraState reported to other modules puts the focus 30 m ahead → world mode's thin-lens DOF stays idle
  (nothing blurred, no DOF pass), the shadow map is fitted around the walker, district labels fade out (< 235 m).
  `?diorama`: the tilt-shift DOF is switched off while walking and restored after.

## Files (for the merge)
* new `src/ui/camera/firstPerson.ts` — the walker (input, movement + collision, glide, bob, steps, pointer lock, touch).
* new `src/ui/camera/walkSurface.ts` — where a person can stand and the walking-surface height (plan data only).
* new `src/ui/hud/walkHud.ts` + `src/ui/hud/walk.css` — controls hint, centre dot, touch stick.
* `src/ui/camera.ts` — small hooks only: construct `FirstPerson`; route pointer/wheel/keys to it while active;
  `frame()` skips the orbit update while walking; `toggleWalk` / `leaveWalk` / `chaseFromWalk`; V and C keys;
  flyTo / startTour / service.follow end the walk; service `walking()`, `toggleWalk()`, `walkDebug()`; getState /
  busy / following / mode ('walk') / invariants / stats / resize / dispose aware of the walk.
* `src/ui/shared.ts` — optional `walking?`, `toggleWalk?`, `walkDebug?` on CameraServiceExt.
* `src/ui/ui.ts` — toolbar button (after the tour button), help line (V), info-card kicker "Looking at" while walking,
  `camera:walk` event → toolbar / card sync, hides the first-run hint.
* `src/ui/hud/icons.ts` — `walk` icon. `src/ui/audio.ts` + `src/ui/audio/synth.ts` — `footstep()` voice on `walk:step`.
* `scripts/ui-test.mjs` — `walk` step (also in the default list).

## Walking surface / collision model (walkSurface.ts)
* height = terrain service height (landscape beyond the slab) → sidewalk tops 0.15 → walkway decks with the
  pedestrians' own profile (pedNetwork: bridge interior nodes +0.45, arch to yMid 1.9) → pier deck (feature, 13 m wide,
  0.3) and the boardwalk area (0.3) → the station platform (0.95) with its 5 stair treads (0.158 rise, 0.31 tread) and
  the two end ramps (sim/rail/station.ts geometry).
* solid = occupancy BUILDING | SOLID, WATER unless a deck spans it, RAIL unless ROAD/SIDEWALK (level crossings open),
  the stair cheek walls / platform-edge railings / ramp railings (thin boxes), tree trunks (crown r × 0.09,
  0.16–0.45 m, trees > 3.2 m only) and street-furniture keep-clear discs (r × 0.55 ≤ 0.55, discs ≤ 1.6 m). Beyond
  the slab: landscape water only (world mode); the tabletop edge in `?diorama`. Bounds = the orbit pivot's bounds.
* movement: 0.18 m sub-steps; blocked → slide along the axis that is free; a step up > 0.36 m or down > 0.6 m is a
  wall (platform edges, quay walls); natural slopes steeper than 0.9 up / 1.25 down (per metre) stop you.

## Verification
* `node scripts/ui-test.mjs --q noidle --steps walk` (run via a scratch copy importing the main checkout's
  browser.mjs so it shares the screenshot lock): 8/8 — V at the cursor (spawn 0.6 m from the cursor point, eye 1.65),
  drag turns exactly (0° error), W 3.9 m in 3 s with eye error ≤ 2.2 cm (bob) and feet ≤ 13 cm off the surface
  (curb easing, mean 0.5 cm), jog into a facade → stops 0.43 m from it, 0 frames inside, slides 3 m along it, click
  → "Looking at · building" card, Esc closes it and the walk goes on, station concourse → up the steps → feet 0.95 on
  the platform, V leaves (max camera step 0.7 m/frame, no inside frames), HUD button + Esc.
* Found + fixed on the way: `#ui > *` (style.css) re-enabled pointer events on the overlay → it swallowed every click.
* Perf A/B (uncapped, adaptive off, street view `5,1.5,-65,9,0,6` @12, 1536x820@1.25, interleaved ×2, one browser):
  baseline 024d901 orbit 42.92 / 42.84 ms; this branch orbit 43.45 / 42.93 ms (same 229 draws / 3.69 M tris → noise);
  this branch walking at the same spot 43.61 / 42.21 ms (avg 42.91 = baseline; 236 draws, FOV 66, lens idle → no DOF
  pass). Camera module JS while walking 0.06–0.09 ms/frame (orbit 0.12–0.18). → no measurable cost.
* Scenarios (scratch scen.mjs, real keys): pier deck 0.3 walked 48 m; harbour quay stops at x 135.6 (quay 136, water
  beyond); off the west slab edge onto the landscape 40 m (feet follow it up to 0.7); beach stopped at the lifeguard
  tower (solid r 1.5); footbridge climbs the arch (feet up to 1.9) but stopped at z 125.8 (south end) — under
  investigation; park blocked by a trunk after 1.5 m → blocked steps now veer round round obstacles (44a809c).

## Next / open
* (in progress) scenarios: footbridge arch, pier, beach to the waterline, harbour quay edge, park, off the slab.
* perf A/B at the street view (baseline 024d901 copy on :5193 vs this branch): orbit unchanged? walk view cost?
* full ui-test default steps, typecheck, build.
