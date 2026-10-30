# Detail round: people and vehicles

Branch `claude/detail-people-7b792a`, port 5205. Shared rules: `DETAIL-ROUND.md`. Master switch `?nodetailpeople`, one `?no<name>` per family (`src/core/detailPeople.ts`).

## Resume here
Round 1 in progress. See "Rounds" for what is committed; the ranked list below is what is left. Capture tool: a small driver in the session scratchpad (`lab.mjs`, shots as JS strings), rewrite if lost: one page, `setSpeed(0)`, `C.view(...)` per shot.

## Audit (round 1, by eye at 2–30 m, noon + night)
Ranked by wow per ms:
1. Dot grid / speckle on clothes and skin at 3–8 m (user-visible, in the brief). Causes found: (a) three's PCF rotates its 5-tap Vogel disc by per-pixel noise: stipple wherever a penumbra crosses a figure; (b) the coarse shadow proxy shadows the detailed figure along every hem; (c) weave bump near pixel size; (d) fold height jumping at cell ends → dotted lines in the derivative bump.
2. Feet hover: no contact at close range (sun-shadow texels far coarser than a sole).
3. Everyone moves alike: same arm swing, posture, head turns at random angles at nothing.
4. Shirts vacuum-sealed, no folds; skirts are cones with stripes.
5. Neck reads as a long tube on flat shoulders: no trapezius.
6. Wedding / park cost: close level 13 k tris per figure, 20 guests within 15 m.
7. Cars: see round 2.

## Rounds
### Round 1: figures
| feature | toggle | cost |
|---|---|---|
| Figure's shadow lookup lifted 12 cm towards the sun, fixed PCF disc on figures | `?nopedshadowlift` | 0 extra taps |
| Weave relief fades out earlier, fold relief continuous, grain stays colour only | always on (bug) | 0 |
| Foot contact shadows (close + near levels, fade with lift) | `?nofootcontact` | 2 quads per figure < 40 m |
| Soft cloth folds on tops and sleeves, pipe folds on skirts (no mirrored chevrons) | `?nofolds` | FS ALU, close + near |
| Trapezius into the neck (rig rings, all 4 targets) | always on | 0 |
| Gaze: the camera at eye level, companions, passers-by, traffic at the kerb; shoulders follow past 25° | `?nogaze` | a few checks per head target |
| Each person's walk: swing, elbow, abduction, slouch, head carriage; pockets / hands behind the back | `?nowalkstyle` | 0 |
| Talking on the way: hand gestures in turns, nods | `?nowalktalk` | arm IK for speakers only |
| Hand in hand: child + parent 80 %, couples 28 % | `?noholdhands` | arm IK |
| Close-level budget: radius pulls in beyond 14 figures | `?noclosebudget` | saves |

## Hand-offs
- **light-sky-water**: three's PCF noise rotation (`interleavedGradientNoise` in `shadowmap_pars_fragment`) is a visible halftone on the ground along every sun-shadow edge at eye level (`src/render/sky/shadowPatch.ts` could replace it near the camera: a fixed disc costs nothing, and figures here now use one). Grep the chunk for `interleavedGradientNoise( gl_FragCoord.xy ) * PI2`.

## Changes outside my files
none yet.
