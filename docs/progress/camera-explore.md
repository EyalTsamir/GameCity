# Camera — going inside things (free camera upgrade) — progress log

## Resume here
* State (2026-10-29 ~21:40): feature implemented + committed (44d8d88, 97022aa); typecheck clean; explore
  traces / screenshots verified (see Verification). OPEN: (1) full ui-test run on the full city
  (`node <scratch copy of scripts/ui-test.mjs with browser.mjs imported from C:/Projects/GameCity/scripts>
  --url http://127.0.0.1:5182/ --q noidle`) — queued on the shared lock when cut off; all default steps incl.
  the new `explore` must pass; (2) `npm run build`; (3) final report to the user (Hebrew): how to use, fly-up
  causes, files touched (list below / notes folder `camera-explore.md`).
* Dev server for this worktree: `npx vite --port 5182 --strictPort`.

Branch `claude/camera-explore-8a2dd3` (cut from `claude/pensive-gates-bim12i`). Brief: a camera that can go inside
buildings, landmarks, trees, the station, under bridges, and never flies up when it touches a building.

**User decision (2026-10-29):** no third camera mode — the existing FREE camera (the default) gets the behaviour.
GUIDED (`G`, `?guidedcam`) is unchanged. So there is no new HUD button or key.

## Diagnosis (measured in the real app, free camera, before the change)
Per-frame camera traces (`?camdebug`, playwright, street spot beside a downtown tower):
* plain orbit / WASD / wheel in free mode: never lifted (free mode already skipped the arm rules).
* **Roof-lift snap** (`applyCamera`, `floorY` clamp): free mode lets the camera sit inside a building; the moment
  anything non-free starts (a click → follow, any flight) the guided rules run and the camera is clamped onto
  that roof *in one frame*: 2.4 m → 42.9 m on the first frame of a click.
* **Take-off rise** (`startFlight`): a flight that zooms out from between buildings first rises up to 120 m
  straight up, plus the roof-clearing arc planning. Clicking the 150 m TV tower from the street went to 348 m
  (up to 32–50 m/frame) and came back down to frame it from outside; a number-key flight rose to ~400 m.
* **Static follow framing**: clicking a building flies out to frame it whole (far and high) and crane-ups the
  pitch over occluders.
* Guided orbit: roof lift / escape (W toward the tower: 44 → 144 m) — by design, left as is.
* Also: free min distance 3 m, pitch ≥ 2° (cannot look up), near plane ≥ 0.3 m, flights clamp to ≥ 12 m / 10°,
  a lost follow settles to ≥ 48 m / 30°.
* Facades are single-sided (`gen.ts`: "Back face skipped"): from inside an ordinary building the street shows
  through a void with balconies floating in it (A/B shots). Landmark lots (station, town hall, church) have
  walls of their own inside (station hall arcade, church nave with stained glass) and look right as they are.

## Done
* `src/ui/camera/explore.ts` (new, `ExploreAid`): lot grid; `floorAt` (rendered ground / water surface + 0.4 m);
  `nearPlane` (usual near, down to 0.05 m only when a wall / floor / ceiling is within ~0.6 m); `focusAt`
  (lens DOF focus on what is ahead once the pivot is < 2.5 m away, via `postfx.setFocus`); the **room**: one
  BackSide box = the current storey of the footprint the camera is in (buildings-module lots only — landmark
  kinds excluded), shader floor (planks / carpet tiles / concrete / stone by kind), plaster walls with window
  bays by kind (curtain wall for offices, punched windows, shop fronts on the ground floor, clerestory for
  industry), door openings at `lot.doors` on the ground floor, ceiling light panels; direct sun ×0.3 inside,
  own glow (stronger at night). Hidden unless the camera is inside; warmed by main.ts's warm-up.
* `src/ui/camera.ts` (small, localized hooks; `freeRules() = !guided && !tour.active`):
  - nothing lifts the free camera: no roof lift / `floorY` snap, no crane-up, no take-off rise or roof-arc
    planning in flights, no settle-rise after a lost follow, no chase-release bump; floor = `explore.floorAt`;
  - click on a building / landmark = info card only (`inspect`; `following()` returns it; Esc / close / empty
    click clears it), no camera move; double-click on one / the ground = glide in close (3–12 m), no rise;
    things that move are still followed on click (follow arm keeps its line of sight, without lifts);
  - `FREE_MIN_DIST` 0.5 m, `FREE_MIN_PITCH` −55° (look up from below the pivot; the ground under the pivot
    limits it in `clampGoal`); flights keep the free limits; `evalFlight` no longer clamps pitch to ≥ 4°;
  - wheel / +− below 6 m (or inside a room): `dollyAlong` moves the camera along the cursor ray (eye height
    kept within ±6–17° of level, so it walks through a door; looking up/down climbs / descends);
  - WASD at least walking pace up close; below 40 m panning keeps the pivot height (a storey, under a bridge);
  - picking from inside a building looks past that building's box (`Scout.pick` skip + second cast);
  - near plane / room / focus applied in `applyCamera`; invariant floor relaxed for the free camera.
* `src/ui/camera/scout.ts`: `pick(ray, skip?)` (look past a skipped hit).
* `src/ui/ui.ts`: help text (Scroll / Click lines only).
* `scripts/ui-test.mjs`: `freecam` close limit 0.5 m; new step `explore` (in the default list): building click
  keeps the camera put + card; room inside an office building + flight out without a jump; wheel walks
  through the station door at eye height; tilt into the ground stops at the floor.

## Verification (full city, 1280×720, headless Chrome on the Adreno)
* explore traces: building click 0 m camera motion; flight out of a 6th-floor room first-frame rise 0.05 m,
  ≤ 3.8 m/frame; follow (lorry) started from inside an apartment ≤ 0.23 m/frame up (was a one-frame roof snap);
  wheel through the station door 24 m at eye height, ≤ 0.58 m/frame; tilt into the ground stops at 0.5 m.
* Screenshots (session scratchpad): office ground floor (door + street outside), office 6th floor (curtain
  wall), apartment (A/B: void → room), station hall → platform, church nave + looking up at the vault,
  under the river footbridge, inside a park tree canopy, between market stalls.
* `npm run typecheck` clean.

## Known issues / next
* The room is a box per storey of the footprint: towers with setbacks / podiums show a room slightly
  larger than the shaft above the podium; gable attics (above `lot.height`) have no room.
* Balcony railings / window furniture of recessed facades can stand inside the room near the windows.
* From inside a building only things beyond its own box can be clicked (by design).
