# Close life: small movements anywhere you walk

Stage 3 of `CLOSE-ROUND.md`. Port 5220, branch `claude/suspicious-goldstine-2c9651`. Time limit 14:00 on 2026-11-01. End the last message with CLOSE-DONE. Master switch `?nosmalllife`, one `?no<name>` per feature (`src/core/closeLife.ts`).

## Resume here
Dev server: `npx vite --port 5220 --strictPort --host 127.0.0.1` from this worktree (`npm ci` done). `npm run bake` run after the moments commit: run it again before perf if a facade or land shader changes.
Tools:
- `node scripts/lifeseq.mjs --out <abs>.png --at "x,y,z,d,yaw,pitch" [--find birds:1|talk|dog|cat|litter|moment|feed|waiter] [--follow] [--yaw d] [--pre js] [--eval js] [--walk 1.3] --frames 12 --every 300`: sheets of frames in real time in the city, shared browser lock. Header lists the options. Expressions must return nothing or a primitive (`void …`).
- `node scripts/peoplelab-sw.mjs --page critters --url http://127.0.0.1:5220/ --out <abs>.png --q "kind=cat&n=8&cols=4&cell=360&coats=0,4&d=0.95&angle=50&pitch=10"`: cats (and `kind=bird`) on software GL, no shared lock, 3 s. Same script without `--page`: people, `dog=1&part=dog&force=1` for dogs, `mode=stand&moment=3&idle=1` for a moment's arms.
- `__city.ctx.services.smalllife`: `birds.tame = true`, `birds.scare()`, `litter.blow()`, `cats.tame = true`. `?momentforce=<1..5>` makes every door do that moment.

Patches: heredocs with apostrophes break in this shell. Write a `.cjs` into the scratchpad. Sources may be CRLF in this working copy. Never `cat >` without input in a Bash call.

## Audit (2026-11-01, noon, ordinary places at 3 and 10 m)
The city holds up at 3 m but pavements are dead: nothing lives below knee height, no bird, leaf or scrap of paper anywhere except the three pigeon flocks on plazas. Plain streets have few walkers (a walk down Market Street meets almost no one on the near pavement). Already there and extended, not duplicated: pigeons (3 plazas, `ambient/birds.ts`), falling leaves that vanish after a few seconds (`life/drift.ts`), dogs at a fixed offset from the walker (`figure.ts`), one talking-hand pose (`animate.ts` IDLE.TALK), phone and coffee, waiters (`cafes.ts`), newspaper readers on benches, scenes.

## Done
| feature | toggle | where | cost |
|---|---|---|---|
| Street birds: sparrows, pigeons, blackbirds, gulls by place, per bubble cell; flush on a wave of alarm, go to a crown or roof, come back | `?nostreetBirds` | `smalllife/streetBirds.ts`, `birdBody.ts` | about 400 tris each, at most 56 |
| Leaves, newspaper, flyers, cups, paper balls, moved by gusts, cars and feet, gather at kerbs and walls | `?nonearLitter` | `smalllife/litter.ts` | 3–4 instanced draws, no shadows |
| Gestures: phrases of real gestures for speakers, nods and a shared laugh for listeners, fidgets for people waiting, near level only | `?nogestures` | `smalllife/gestures.ts`, a block in `pedestrians/animate.ts` | CPU only |
| Cats on garden walls, doorsteps, benches; stand, walk, sit, loaf; head follows you, blink, get up and go when you are close | `?nonearCats` | `smalllife/cats.ts`, `catBody.ts` | about 1500 tris each, at most 3 |
| Dogs: sniff, lag, catch up, look up at the walker, wag by mood; close model with fur, on a lead that hangs in a whole curve | `?nodoglife` (the model stays) | `smalllife/dogs.ts`, `pedestrians/figure.ts`, `render.ts` | close model at most 6 within 14 m |
| Street moments: from a door near you someone sweeps the step, smokes, paces with a phone at the ear, takes the air, two neighbours talk. At most 3 out, 8 people in the pool, in the same figure budget | `?nomoments` | `scenes/moments.ts`, `gestures.ts` `momentPose`, `kit.ts` broom and cigarette | figures only while out |
| Someone on a bench feeds the birds: hand from a bag on the lap, a flick; the nearest flock comes over in ones and twos and stays round their feet | `?nofeeding` | `gestures.ts` `feedPose`, `movers.ts`, `streetBirds.ts` `serveFeeders` | CPU only |

Test views: pigeons and a cat on a bench: plaza by the kiosk `-27,0.5,-23,8,70,8` at noon.

## Corrected by eye
Cat: hoop stripes and a faceted back (first look) became thin broken stripes, ticked hairs, a Catmull-Rom body, legs that come to a point inside the flank. Dog: a hole at the chest, one black silhouette, a lead like a bar through the ground: closed the chest, fur streaks, a countershade, welded joints, a parabola for the lead. Sparrow: too zebra, softened. Phone and smoke: the rig's head point is at the chin, not the middle of the head; targets lifted.

## Perf (first reading, fresh bake, one page with `abprof` behind power-guard, 1920×1025, on AC)
Everything of mine hidden against shown (delta = the cost of it, ms, noon, moments may be out):
| view | base | delta | budget |
|---|---|---|---|
| overview | 32.7 | -0.13 ±0.19 | 0.2 |
| downtown | 30.8 | 0.04 ±0.09 | 0.2 |
| street | 35.0 | 0.27 ±0.41 | 0.7 |
| market | 35.1 | 0.30 ±0.61 | 0.7 |
| plaza by the kiosk | 35.0 | -0.09 ±0.21 | |
Page code: `__city.ctx.scene.getObjectByName('smalllife').visible=false`, and `on=false; timejump()` on the `moments` scene (`__city.ctx.services.scenes.scenes.find(q=>q.name==='moments')`). End every expression with `;0`, or playwright dies on the returned object.

## Left to do (in this order)
1. **Feeding not seen working:** at the kiosk bench the man's hands go right but no birds came in 10 s. New stats `birdsFed`, `feeders` in `lifeseq` output: find out why (`serveFeeders`, `blocked` of the spot in front of the bench, groups away). Capture: `--at "-27,0.5,-23,14,70,8" --pre "void 0" --find feed --follow --yaw 25 --dist 3 --pitch 14`.
2. Waiter capture found no one (`--find waiter`: the test in `lifeseq` for staff may be wrong). Look at a waiter by eye.
3. Litter in motion: stills are fine, no paper seen flying yet. Birds taking off in sequence: `--find birds:1` found no pigeons at the market at the time; try the plaza.
4. Third round: fresh walk at 18.2 and 21.5 along a real pavement (the straight walk in `lifeseq` goes through buildings: pick a target along the street). `mStarted`/`mOut` in the output show whether moments start on a real walk without `momentforce`.
5. Final checks: typecheck, build, `ui-test --q noidle`, `shot --view overview --invariants --validate --speed 4 --wait 20000`, `hitch`, `walkhitch`, `?diorama`, `?quality=medium|low`. Then stop the dev server on 5220, last message ends CLOSE-DONE.

## Seen and not mine
The street tree trunk at 1–3 m is still low poly with a pale oval patch, and the grass tufts round a tree pit are flat blades on a flat green mat (`-3.9,0.3,34,1.3,-55,18`).

## Changes outside my files
`src/main.ts` one module line. `pedestrians/animate.ts`: import, `poseIn.near`, `headRoll` now `let`, the gestures and moments block before "walking with a takeaway coffee", the feeding branch in the bench block. `pedestrians/render.ts`: `poseIn.near`, the close dog mesh. `pedestrians/figure.ts`: dog geometry, lead, fur (`tinyhaven-dog-3`). `pedestrians/crowd.ts`: Member dog fields, `moment`, `momentK`, `stepDog`. `pedestrians/looks.ts`: the black coat a little lighter. `scenes.ts`, `scenes/cast.ts` (`party0`, resets), `scenes/kit.ts` (broom, cigarette).
