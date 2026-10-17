# Camera / UI polish (final review) — progress log

Owner: camera-polish agent. Files: src/ui/camera.ts + camera/*, src/ui/ui.ts + hud/* + ui.css,
src/ui/audio.ts + audio/*, scripts/ui-test.mjs. Brief: "make the camera enjoyable to explore the city freely".
Full-city test runs: `node scripts/ui-test.mjs --q noidle [--steps …]` (add `camdebug` for internals).

## Diagnosis of the lead's 2 ui-test failures (full city, `--q camdebug`)
* **C toggles the chase view** — the test clicked the first pickable scanning from the top-left = a train
  about to enter the east rail tunnel. The camera followed it *into the hill* (follow shot = hillside),
  chase turned on, the train despawned → "has left the scene", camera left low among ridge trees.
  Test artifact (wrong pick) **plus real UX bugs** (following into tunnels; release pose after a vanish).
* **double-click flies to the ground point** — the double-click landed on the Town Hall (landmark):
  the camera flew to the landmark (correct), the test expected the height-field hit. Test artifact.
  BUT single-clicking a tall building parked the camera on its roof (grey blur): the follow occlusion
  logic treated the target's *own* volume as an occluder. Real bug.
* `--q camdebug` on the full city also built the stand-in proxy city on top — now only built when no
  real world pickers exist.

## Done (verified with ui-test / diag runs, full city)
* Follow model: target classes ground / static / air.
  * static (building, landmark, moored barge): extent probed with its own picker → framing distance,
    aim at 0.42 h, own-volume skipped by crane/spring-arm, min distance > own radius; C → clear toast;
    UI hides Chase + says "Viewing". (Office tower: 132 m, pitch 32, outside — was roof close-up.)
  * air (balloon/blimp/plane, kind 'other' with heading, > 22 m up): pivot may go to 340 m high and 340 m
    beyond the slab, pitch ≥ 3°, own chase params (62 m, 7°); flies out of range → toast + glide home;
    Esc → glide home. All three followed + chased, framed centre (ui-test `aircraft`).
  * tunnels: entity below the terrain (plan.heightAt) → hold at the portal → release with
    "… disappeared into the tunnel" + settle pose (rise to ≥30°, ≥48 m). Vanished ("gone") → same settle.
* Tracked-flight yaw fix: target yaw unwrapped against the previous frame (was against the flight
  start → 2π flips = the 157 m jump cut seen in the tour baseline).
* Double-click acts on the first click's pick (camera may already move).
* Low-orbit collision rewritten: exact segment-vs-box scan of the arm (lots + tall features, 1 m
  margin, thin masts/chimneys ignored; hills by a 2 m march) instead of the 2 m height grid; the camera
  slides along the arm and never *through* a building; close-ups (<100 m) keep a line of sight to the
  pivot; look-ahead samples spaced by arm motion (≤2.5° / 3 m / 4 %, ≤20) with a two-phase corridor
  check; critically damped springs (in ω16 / out ω3.2) for the arm and the roof lift; bounded lag
  ≤1.5 m. Pivot rides over roofs when panning close (was sinking inside buildings).
  Sweeps: 0 inside frames, downtown ≤8 %/frame (baseline: 42–46 %/frame snaps, 24–36 inside frames).
* Follow cams use the same arm logic (line of sight always; was a separate grid-based spring arm that
  snapped 168→22 m at tour entity shots = the 81 %/frame jump), blended in over the second half of
  tracked flights; follow roof lift only for low roofs (lifting over a 65 m tower beside a pedestrian
  popped the camera 60 m up). Aircraft chase 70 m / 18° (7° showed only haze behind the plane).
* Roof lift reads exact roofs (SurfaceField.roofAt: boxes + 1 m margin) instead of the 2 m-dilated
  grid (a camera beside a facade was "over the roof" → lift snaps at short follow distances).
* Tour road-vehicle shots: swing centre 18° ± 22° (was 28° ± 30°) at 27° pitch — the arm stays in the
  street corridor instead of being squeezed by the buildings beside it.
* Tunnel verified: follow a departing train → held at the east portal → "Regional to Easton Bay
  disappeared into the tunnel" → settles to 117 m / 35° framing the portal.
* Every moving kind verified (ui-test `kinds`): car, bus (route + next stop), resident, tug, train.
* Help card / toasts copy updated (aircraft can be followed, buildings get a look, dbl-click frames).
* District flags are pointer-transparent (a drag that started on the "Downtown" flag did not orbit at
  all — found by the lead-command run); clicks reach them through `camera.clickHook` (UI hit test),
  hover shows "Click to fly there". ui-test `labels` also clicks a flag.
* ui-test criteria: kinds need ≥1 info line (a seated resident has one); sweep pops = second
  difference (maxAccel < 6; the old snaps were 27–29) with ≤15 %/frame as a sanity bound.
* Flights vs. arm rules (final model, after several tour traces):
  - place / tour flights: the planned path rules the arm; obstacles in the way are glided over by the
    roof lift (look-ahead + spring, any height). The orbit rules applied to a pivot gliding at street
    level squeezed the arm to 4 m beside the harbour ship / downtown towers.
  - fly-ins to a followed thing: shown arm = flight path, handing over to the follow arm in the last
    30 %; a tracked flight that starts with the arm pulled in (chase toggle, new click) keeps it
    (resetting let go at once → 161 %/frame jump into a wall). Their yaw turns in the first 65 %
    (turning during the low final approach swept the arm through the buildings beside the street).
  - a camera already *behind* a building stays behind until the arm swings clear (never dragged
    through); only the low chase cam insists on line of sight; escapes only when the camera point is
    truly inside a solid (grazing the 1 m margin along a facade is not inside).
  - follow pull-in spring ω 12 (orbit / chase 16).
  - every flight starts from where the camera really is (pulled-in arm length, crane-lifted pitch) and
    its arc is planned so 15 samples of the camera path clear the roofs by 3 m; the lift (0.3 m roof
    margin, motion-spaced look-ahead) glides over anything left. (Starting from the logical pose made
    the first tour frame after a street-level orbit jump 7× / 45–63 m.)
  - take-off: a flight that extends outward from low between buildings first rises vertically (pure
    pivot rise, everything else waits) clear of every roof within 30 m + along the arm, then flies;
    the rise fades over the second half. (Extending first drove the camera into the tower behind it.)
* ui-test: restored the 1.5 s post-load wait (the loading screen takes the pointer while it fades),
  target scans skip district flags, per-kind follow retries if something drifts into the click, buses /
  trains / boats located via the census, inside-frame location reported, tour criteria = no cuts
  (step < 12 m), no pops (accel < 20, < 30 %/frame), ≤ 2 inside frames.
* Static framing fits roof + foot ~12° inside the frame (pitch-aware), aim at mid-height.
* District labels: reveal waits for the intro, timed from the first frame (shader warm-up after the
  constructor made them pop in mid-glide); declutter by priority + keep clear of title/toolbar/minimap/hint.
* Verified at 1536x820@1.25: intro smooth (0.3 %/frame), hint/labels/toolbar/minimap clear and readable,
  all 10 place flights smooth + never inside, sweeps ≤8 %/frame + never inside, 60 fps headless.
* ui-test motion stats normalise by the longer neighbouring frame interval (stall artifacts).
* ui-test.mjs: --dpr, per-frame recorder, chase on a road vehicle near the centre, building framing,
  dbl-click ground + building, aircraft, every POI flight, sweep, tourwatch smoothness, intro/first-run.

## Final verification (2026-10-17, full city)
* `node scripts/ui-test.mjs --q camdebug --out shots/z_lead` (lead's command, 1280x720, default steps):
  **40/40 pass**, 0 console errors / warnings, invariants clean, 60 fps, camera 0.12 ms/frame.
* `--q noidle --width 1536 --height 820 --dpr 1.25 --steps intro,…all…,tourwatch` (user's screen):
  43/44 under the old tour criterion; the one flag was an absolute 18 m/frame step at 241 m distance
  (8.7 %/frame, accel 7, 0 inside) — the criterion is now relative + acceleration, which it passes.
  Aircraft re-verified after the town-backdrop chase swing (shots/z_air_*).
* tsc --noEmit: clean (whole project) at the end.
* Aircraft chase: trails the plane while it heads for town, swings round to ride ahead looking back
  once it has passed (town stays in the backdrop); stops auto-swinging once the user turns.

## Next (if resumed)
* Nothing open in scope. Optional: tree canopies (ctx.services.vegetation.trees) as soft obstacles for
  the low chase cam; label declutter could prefer nudging over hiding.

## Reported to the lead (other modules)
* traffic: while a bus is boarding, its info reads "Boarding at Town Hall" + "Next stop: Town Hall"
  (nextStopName returns the stop it is at) — could show the following stop instead.
* tsc: src/sim/pedestrians/crowd.ts(1423) TS2367 at the time of the final run (pedestrians agent WIP).
* src/style.css: `#loading.done` keeps intercepting the pointer for its 1 s fade (visibility flips at
  the end) — a first drag right after load is swallowed; suggest `pointer-events: none` on `.done`.

## Known issues
* Fast sweeps through dense downtown at very low pitch can still need a small catch-up step when the
  page stalls (dt clamp 0.1 s moves the arm ~7° in one frame).
