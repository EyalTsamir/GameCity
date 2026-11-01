# Close life: small movements anywhere you walk

Stage 3 of `CLOSE-ROUND.md`. Port 5220, branch `claude/suspicious-goldstine-2c9651`. Time limit 14:00 on 2026-11-01. End the last message with CLOSE-DONE. Master switch `?nosmalllife`, one `?no<name>` per feature (`src/core/closeLife.ts`).

## Resume here
Closed by the schedule on 2026-11-01 at 11:40: all committed, dev server stopped. Second of the three rounds finished, third not done: see "Left to do".
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

Those figures predate the last two commits (fed flocks stay closer, a little more bird movement near a bench): no geometry changed since. The coordinator measures everything at the merge: perf pending for the final state.

## Final checks (2026-11-01, stopped early by the user's schedule)
- `typecheck`, `build`: pass.
- `shot --view overview --invariants --validate --speed 4 --wait 20000`: first run had two crowd walkers overlapping for 4.3 s at (-103.9, -4.9), a stroller and an elderly walker on a sidewalk, neither of them mine; second run `{}`, validate `[]`.
- `ui-test --q noidle`: 73 passed, `kinds` failed, `kinds` alone passes (the known flake).
- `?diorama`, `?quality=medium`, `?quality=low`: no failed module, no frame error, invariants `{}`, picture fine in the diorama and low sheets. No console errors; the shader-compiler warnings are the ones every session sees.
- `hitch`: 0 new programs in the overview windows. On: one 116 ms frame at overview@12, allocation 20.7 and 14.4 MB/s (overview@12, @21.5). `?nosmalllife`: no such frame, allocation 20.5 and 15.8 MB/s, so the allocation at overview is not mine. One run each on a shared machine, so the single long frame says little either way.
- `walkhitch`: mean 40.1 ms, 28 frames over 50 ms, 0 over 100 ms, no new programs. No baseline run to compare with. The near layers build in at most 0.3 ms (`streetBirds`, `nearLitter`, `nearCats`).
- None of the `hitch` or `walkhitch` runs were behind `power-guard`, and the machine was unplugged at about that time: read their frame times as indicative only. Programs and allocation are not affected.

## Left to do
Not done, by the schedule:
1. Third round: a fresh walk at 18.2 and 21.5 along a real pavement (the straight walk in `lifeseq` goes through buildings: pick a target along the street). `mStarted`/`mOut` in the output show whether moments start on a real walk without `momentforce`. Moments and the feeding were forced or found at one place, so how often you meet one on a plain walk is unjudged.
2. A waiter by eye: `--find waiter` found no one (the test in `lifeseq` for staff may be wrong). Waiters themselves were not changed.
3. Litter in motion: stills are fine, 26 to 39 of about 60 pieces moving at `?wind=1.3`, but no paper was seen flying by eye. A flock's take-off in sequence was not seen either, only single pigeons flying in. Gull and blackbird close up not seen.
4. Birds in the feeding test are round the bench at 1.5 to 3 m. The flock's patch was tightened after that capture and not looked at again.
5. Perf of the final state: pending, the coordinator measures at the merge.
6. The close dog model, its fur and the lighter black coat are not behind `?nosmalllife` or a quality tier (`?nodoglife` only stops the behaviour). They should get a switch if the dogs turn out to cost anything.

## Seen and not mine
The street tree trunk at 1–3 m is still low poly with a pale oval patch, and the grass tufts round a tree pit are flat blades on a flat green mat (`-3.9,0.3,34,1.3,-55,18`).

## Changes outside my files
`src/main.ts` one module line. `pedestrians/animate.ts`: import, `poseIn.near`, `headRoll` now `let`, the gestures and moments block before "walking with a takeaway coffee", the feeding branch in the bench block. `pedestrians/render.ts`: `poseIn.near`, the close dog mesh. `pedestrians/figure.ts`: dog geometry, lead, fur (`tinyhaven-dog-3`). `pedestrians/crowd.ts`: Member dog fields, `moment`, `momentK`, `stepDog`. `pedestrians/looks.ts`: the black coat a little lighter. `scenes.ts`, `scenes/cast.ts` (`party0`, resets), `scenes/kit.ts` (broom, cigarette).
