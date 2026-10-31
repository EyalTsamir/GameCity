# Detail round: people and vehicles

Branch `claude/detail-people-7b792a`, port 5205. Shared rules: `DETAIL-ROUND.md`. Master switch `?nodetailpeople`, one `?no<name>` per family (`src/core/detailPeople.ts`).

## Resume here
Rounds 1–4 committed (see "Checks at the head"). What is left is under "Left", nothing there ranks as worth its cost right now. Capture tool: a small driver in the session scratchpad (`lab.mjs`, shots as JS strings), rewrite if lost: one page, `setSpeed(0)`, `C.view(...)` per shot.

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

### Round 2: vehicles, life details
| feature | toggle | cost |
|---|---|---|
| Bus doors fold open at stops (VS, `aInst2.y = 10 + open`), the doorway shows the cabin | none (bug-level fix) | a few VS ops on vehicles, one pane per door |
| Estates and people carriers in traffic (they only stood parked) | none | same draw calls when present |
| Car cabins: round headrests, darker seats; no shadow speckle on paint and glass | none | 0 |
| Shoes with a real toe box (rig rings) | none | 0 |
| Fill and bounce light on figures in shade (no black cut-outs) | `?nopedfill` | few ALU |
| Blink (FS, close level), hem pipe folds + slow air movement (VS, not far levels) | always on with close level | few ALU |

Measured, round 1 at 1300x930, 2 repeats, AC, interleaved (ms/frame vs `?nodetailpeople`): overview +0.4 (noise ±0.3), downtown 0, street +0.15, market −0.3, plaza −0.2. Triangles unchanged within the crowd's variation. Below the budget of +1 ms.

### Round 3: cars
| feature | toggle | cost |
|---|---|---|
| Each model its own face and tail: lamp and grille proportions (`CarDims.face`; hatch, sedan, SUV, estate, MPV; compact keeps its round lamps) | none | 0 (same parts) |
| Reflections softer on flat panels: the hard white rectangle on every boot lid is gone | none | 0 |

Measured before round 3, at 1920x1025, high, 10.76 h, 2 repeats, AC (ms/frame, head vs `?nodetailpeople`): street 33.4 vs 32.8 (+0.6), market 33.6 vs 33.2 (+0.4), park 37.0 vs 36.0 (+1.0), church 38.1 vs 38.0 (+0.1). Other sessions were using the machine, repeats differ by up to 1 ms. The close budget made no measurable difference in these windows (`?noclosebudget` church 37.4): the wedding was probably not in its crowded phase during the measurement, so its saving at the wedding is **unconfirmed**. Triangles did not change beyond the crowd's own variation.

### Round 4: new car bodies and faces, hair, clothes (audit 2026-10-31, after the weekly reset)
Fresh audit at eye level. Ranked: (1) the cars ride high with a toy's windscreen and share one face; (2) dark paint washes to the same silver-blue on every upward panel; (3) hair is a helmet at 2–3 m; (4) four in ten people should not wear a plain solid colour; (5) backpacks are flat slabs; (6) light skin blows out to a white mask in full sun. Audited and left alone, looked fine at eye level: trains and platform, boats, vans, lorry, bus, cyclists.
| feature | toggle | cost |
|---|---|---|
| Six cars instead of one: each model has its own nose shape, lamps (atlas + rounded conformed quads `endQuad`), grille, intake, fog lamps, bumper furniture and tail (`carFront`, `carTail`) | `?nocarfaces` | triangles: about the same as the old parts (`carSmalls` adds a little on level 0) |
| Real ground clearance (sill −8 cm, bumper line kept), thicker noses, a windscreen wider at its base than its top (`screenSpread`), square tails on the boxy models (`TAIL_SQUARE`) | `?nocarfaces` | 0 |
| Paint keeps its colour: lacquer gain falls off head-on (`thPaintGain`), still mirrors at grazing angles | none | 0 |
| Wheels by model (5, 6, 7 or 10 spokes), exhausts, mast aerials, chrome or black rubbing strips | `?nocarfaces` | level 0 only |
| Hair: 48 separate locks over the cap (close level, not cropped hair, no hat), broader swells and curls in the cap's outline | `?nohairlocks` | ~480 tris on a close figure |
| Cloth prints: stripes, checks, chest print, yoke, dots (near + close, fade before aliasing; plain on white / bridal cloth) | `?noclothprints` | FS ALU, one branch for plain cloth |
| Backpacks: soft sack, front pocket, zips, side pockets, webbing, grab loop | `?nobagdetail` | small; the pocket on the near level, the rest on close |
| The jaw's shade on the throat (vertex tint); light skin tones deeper and warmer | `?noskintone` (skin only) | 0 |
| A pram is parked across behind whoever sits down (it stayed pushed out in front: through the table, the sitter inside it); walkers go round it there | none (bug) | 0 |
| Hip join: lighter rings and the pelvis's normal on the thigh tops (light trousers read as a nappy) | `?nohipblend` | 0 |

Measured after hair, backpacks and the car bodies (before prints, wheels and small parts): 1920x1025, high, 10.76 h, 2 repeats, AC behind the guard, ms/frame head vs `?nodetailpeople`: overview 35.0–35.5 vs 35.0–35.8, downtown 34.9–35.0 vs 34.9, street 33.4–33.6 vs 33.3–33.4, market 32.5 vs 32.3–32.5, park 31.5 vs 31.5. Within noise, at most +0.2. Triangles unchanged within the crowd's own variation. Not behind the master switch, so not in this comparison: paint gain and the neck tint (both 0 by construction).

Measured again with prints, wheels and small parts, before the hip join (0 cost by construction): same setup, overview 36.6 / 35.1 vs 36.2 / 35.0, downtown 36.3 / 35.1 vs 36.2 / 35.0, street 34.8 / 33.7 vs 34.4 / 33.5, market 33.5 / 32.5 vs 33.4 / 34.3 (that last one is noise). So about +0.1 to +0.3, below the +1 ms budget; the first repeat ran about 1 ms slower than the second for both variants. Triangles: within the crowd's own variation, well under +250 k. Night not measured, park not repeated in this run (31.5 vs 31.5 in the run above).

Sheets: `detail/people/round4-cars.jpg`, `round4-hair.jpg`, `round4-people.jpg`.

Best views: cars at eye level on any street at noon, 4–6 m (`__city.ctx.services.traffic.vehicles()` to find a model); police and taxi are the sedan's variants; night at 21.5 for the lamps. Hair: 1.5–3 m, three-quarter back. Prints: the market or any pavement, 4–15 m.

## Checks at the head
Head `01ca6d8` + log. `npm run typecheck` clean, `npm run build` OK. `shot.mjs --view overview --invariants --validate --speed 4 --wait 20000`: invariants `{}`, validate `[]`, console clean. `hitch.mjs`: prog+0 in all windows. Allocation is the known ~18 MB/s at overview@12 (`perf-deep.md`: 19 MB/s).

On the code just before the hip join (one tint + normal change at build time): `?diorama`, `?quality=medium`, `?quality=low`: no errors, invariants `{}`; their images not looked at. `ui-test.mjs --q noidle`: 70 passed, `kinds` failed, then passed alone (the known flake). Soak 4 min at 4×: no frame errors, 0 new programs, heap steady; 2 overlap samples: a parent and a tourist pausing at (-34.9, 38.9) for 5.3 s, two dog walkers in the park at (-74, 9.6) for 3.3 s. Not compared with a baseline soak, and different places from the last soak: rare and short.

Opening film: contact sheet in seek mode looked at, figures and hair fine; not run in realtime. Motion: one walker in a stepped 1 s sequence looks right; not watched at 1×. Guitar and applause still not listened to.

## Left
Ranked after round 4; none of these looked worth its cost now:
- Faces under ~1.5 m: still a mannequin's, cheeks go pale and patchy in the sun. Only seen from nearer than people stand in walk mode.
- An open shirt's V on the chest is a flat colour, no neckline.
- Pedestrian overlaps: rare, 3–5 s, in passing (see the soak above). Café seat overlaps not re-examined.
- Wedding cost: not addressed. Church view at 10.72 h shows 25 near-level figures, measured +0.1 ms over `?nodetailpeople` in round 3, so it comes from before this round.
- Boats and trains: audited at eye level, unchanged, they hold up.

## Hand-offs
- **light-sky-water**: three's PCF noise rotation (`interleavedGradientNoise` in `shadowmap_pars_fragment`) is a visible halftone on the ground along every sun-shadow edge at eye level (`src/render/sky/shadowPatch.ts` could replace it near the camera: a fixed disc costs nothing, and figures here now use one). Grep the chunk for `interleavedGradientNoise( gl_FragCoord.xy ) * PI2`.

## Changes outside my files
none yet.
