# Harbor module progress (src/world/harbor.ts + src/world/harbor/*)

Owner: harbor builder (round 2). Resume point if a run is cut off.
STATE AT PAUSE (usage limit): module loads, `npx tsc --noEmit -p .` clean for harbor files, invariants {} (clean),
console clean. All features built. Remaining work = verification + polish (see "Next").

## Architecture (draw calls: 4 static + 2 rigged + glows + beam; glows hidden by day, beam by day)
- `harbor/geo.ts` HB builder (pos/normal/colour + aEmit/aPat [+ aRig/aPivot]), transform stack, primitives.
  quad() normal from diagonals + zero-normal guard in vtx() (fixes NaN -> black bloom blocks).
- `harbor/material.ts` shared material, now MeshLambertMaterial by default (visually identical, -0.4 ms;
  `?harborStandard=1` = old MeshStandardMaterial). Patterns (corrugated, planks, hull grime, stone, glass);
  emission modes (lights/blink/chase/steady/beacon/marquee/lantern/spoke). RIGGED variant: vertex-shader rig
  (ship bob uShip, crane uCrane[3], mobile boxes uMob[6], wheel uWheel + upright gondolas, carousel uCar +
  horses bobbing with the rotation angle) + rig depth material for shadows. Glow mesh (halos/pools, can
  follow cranes). Lighthouse beam mesh (softened: uBeam 0.32*lights, pow 3.2 / along pow 2.3).
- meshes: harbor-north (quay rails, bollards, fenders, quay containers, breakwater, lighthouse, ferry dock),
  harbor-yards (north-strip + freight containers), harbor-beach (pier, wheel/carousel static parts, beach),
  harbor-river (footbridges, jetty, boats), harbor-animated (ship, cranes, mobiles, mooring),
  harbor-rides (ferris wheel + carousel), harbor-glows, harbor-lighthouse-beam.
- debug toggles: `?harborHide=north,yards,beach,river,animated,rides,glows`, `?harborNoShadow=1`.
- files: cranes.ts (geometry + CraneSim), ship.ts (hull loft, superstructure, mooring, quay edge),
  containers.ts, breakwater.ts, pier.ts (pier, wheel, carousel), beach.ts (+ferry dock), river.ts.
- service ctx.services.harbor: cranes(), ship, ferryBerth {x:144.2,z:-14,yaw:PI}, obstacles[] (rects boats
  must avoid: ship, breakwater, lighthouse, ferry pontoon, pier, jetty), bridgeClearance(x,z).
- funnel smoke: ctx.services.smoke.addEmitter wired (guarded) — not visually verified yet.

## Measured (perf.mjs, 1300x930, noon, ";skip=harbor")
- harbor view 14.36 vs 13.50 = 0.86 ms; beach 13.47 vs 12.84 = 0.63 ms; overview 14.90 vs 14.05 = 0.85 ms.
  (before Lambert/split/glow-hide: 1.54-1.67 ms in the harbor view). Errors counted in both variants = other modules.

## Verified by screenshot
- shots/harbor_t2.png (harbor day), harbor_cr_1/2.png (crane motion 2 s apart), harbor_beach2.png (beach+pier),
  harbor_lh1.png / harbor_lh_n1.png (lighthouse day/night, before beam softening), harbor_fb1.png (footbridge),
  harbor_lam1.png vs harbor_std1.png (Lambert vs Standard: same look).

## Next (priority order)
1. Inspect shots/harbor_pier1.png (day) + shots/harbor_pier_n1.png (night, wheel chase/carousel marquee/festoons) — taken, NOT yet looked at.
2. Verify the crane work cycle: `node scripts/shot.mjs --q "only=sky,terrain,water,ambient,roads,harbor,postfx" --view "130,0,-78,90,70,30" --speed 8 --wait 30000 --stats` -> craneJobs > 0, containers toggle ship<->quay.
3. Night: lighthouse beam after softening (182,5,-140,70,40,25 @21.5), harbor @21.5 (crane aviation lights, floodlight pools, ship windows), riverside lamps.
4. Full city (no only=): console, invariants, overlaps (plan benches at (160,55.7),(186,55.7) vs pier railing at z 55.56; quay surface height vs rails/containers; boats vs ferry dock/jetty).
5. Polish: ship superstructure detail; ferry dock close-up; umbrellas 24/38 placed (clearance limits).
6. Re-run perf (harbor/beach/overview) after polish.

## Known issues
- glow halos only at night (glow mesh hidden by day); emissive aviation bulbs still blink by day.
- PAT.GLASS roughness has no effect with Lambert (harmless).

## Best views
- harbor; "130,0,-78,90,70,30" (cranes+ship, 2 shots 2 s apart); "182,5,-140,70,40,25" (+ --hours 21.5);
  beach; "165,8,60,80,170,22" (pier+wheel, day + 21.5); "-82,0,118,45,40,30" (footbridge); riverside
