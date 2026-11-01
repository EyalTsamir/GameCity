# Close life: small movements anywhere you walk

Stage 3 of `CLOSE-ROUND.md`. Port 5220, branch `claude/suspicious-goldstine-2c9651`. Second limit 23:30 on 2026-11-01. End the last message with CLOSE-DONE. Master switch `?nosmalllife`, one `?no<name>` per feature (`src/core/closeLife.ts`).

## Resume here
Closed at about 23:58 on 2026-11-01, about 30 minutes past the limit: one capture batch waited 2.5 hours for the shared browser lock. All committed, dev server stopped. See "Second round" and "Left to do".
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
| The finer dog within 14 m (model only, separate from `?nodoglife`), off below medium | `?noclosedog` | `pedestrians.ts`, `render.ts` | see the dog row |
| Someone on a bench feeds the birds: hand from a bag on the lap, a flick; the nearest flock comes over in ones and twos and stays round their feet | `?nofeeding` | `gestures.ts` `feedPose`, `movers.ts`, `streetBirds.ts` `serveFeeders` | CPU only |

Test views: pigeons and a cat on a bench: plaza by the kiosk `-27,0.5,-23,8,70,8` at noon.

## Second round (2026-11-01, evening)
Synced to the stage 3 merge (`bfd0206`), fresh bake. Walks: `lifeseq --pedwalk <poi>`, camera at eye height along the walkway graph, nothing forced, 42 s each, with a once-a-second log of what is in sight in front of the walker.

Seconds of 42 with a moment in sight within 25 m:
| walk | hour | moments in sight | started |
|---|---|---|---|
| westbrook | 18.2 | 14 | 6 |
| industry | 18.2 | 12 | 5 |
| park | 18.2 | 0 (no doors on the way) | 2 |
| oldtown | 21.5 | 2 | 4 |
| westbrook | 21.5 | 14 | 4 |
| downtown | 21.5 | 0 | 0 |
| station | 12 | 12 | 6 |

Judged from the sheets: a plain walk does meet someone on the phone or taking the air, at a rate that reads as ordinary, and they pass for neighbours and not for a feature. Moments were not looked at up close on these walks. The downtown walk at night had none because office doors stopped at 20:00: they now go on until 22:30, few of them, smoke or phone only. **That change has passed typecheck and build only: it has not run in a browser.**

The `birds` counts in that log include roosting and away groups, so they mean nothing at night, and the sheets at 640x360 are too small to judge sparrows. `cat`, `dog`, `talk` were rare in these seven walks: 0 to 5 seconds of 42.

Feeding after the last edit, by eye (plaza by the kiosk, noon): **works**. The man flicks from a bag on his lap, sparrows peck in front of the bench, pigeons at its side, one pigeon flies in across the frame. The best thing to show of this session.

Litter: in the feeding sheet, at the ordinary wind, a cup and paper balls roll across the plaza (stats: 27 of 40 pieces moving at the end). The sheet at `?wind=1.4` (13 of 41 moving) framed a spot where nothing visibly moved. No sheet of paper was seen in the air in any frame, so flying paper remains unconfirmed.

Close dog: `?noclosedog`, off below medium, committed.

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

## Final checks tonight (final state, 23:55)
- `typecheck`, `build`: pass.
- `shot --view overview --invariants --validate` and one walk at 20.5 to check the late office change: **did not run**. Both hit their caps (10 and 5 minutes) waiting for the shared browser lock.
- `ui-test`, `hitch`, `walkhitch`, `?diorama`, `?quality=medium|low`, perf: **not rerun on this state.** The results below in "Final checks (2026-11-01, stopped early…)" are from commit `5f79417`, before the merge. The seven walks ran on the merged code before the late office change, with invariants `{}`, no frame errors and no console errors.
- Commits since `5f79417`: the close dog switch, the walk tool, the late office moments. No geometry or shader changed.

## Left to do
Not done: the browser queue ran out the time.
1. **Not seen by eye:** the waiter, the whole-flock take-off, gull and blackbird up close. The batch for these got "nothing found" for `--find waiter:1`, `birds:1`, `birds:2`, `birds:3`, and the cause was not looked into. `waiter:1` needs a waiter mid-round, so empty is plausible; `birds:<kind>` failing while pigeons were on screen points at the finder (`lifeseq.mjs`), not at the birds. Try `--find waiter` and `--find birds` without a kind.
2. **Perf of the final state not measured.** Market went up 1.25 to 1.73 ms in the merge; my share of it is unknown this round. Before the merge my delta at market was 0.30 ±0.61 ms (budget 0.7), and nothing costly has been added since except the close dog switch, which can only lower it. To measure: `perf1.sh` method above, fresh bake, on AC.
3. **Final checks not rerun in full** on this state: see "Final checks" for what ran tonight.
4. Sum with the other sessions, seen on the walks and not fixed, not mine: at 640x360 the stars read as large white dots like snow in a night sky (check at full resolution before calling it a bug); shop window pictures look blurred and blocky at 1 to 3 m on the station walk (noon, right side); orange sparks round a bookshop at 18.2 in old town, in strong sun (`ambient/fireflies` or `sparks`, not confirmed which).

## Seen and not mine
The street tree trunk at 1–3 m is still low poly with a pale oval patch, and the grass tufts round a tree pit are flat blades on a flat green mat (`-3.9,0.3,34,1.3,-55,18`).

## Changes outside my files
`src/main.ts` one module line. `pedestrians/animate.ts`: import, `poseIn.near`, `headRoll` now `let`, the gestures and moments block before "walking with a takeaway coffee", the feeding branch in the bench block. `pedestrians/render.ts`: `poseIn.near`, the close dog mesh. `pedestrians/figure.ts`: dog geometry, lead, fur (`tinyhaven-dog-3`). `pedestrians/crowd.ts`: Member dog fields, `moment`, `momentK`, `stepDog`. `pedestrians/looks.ts`: the black coat a little lighter. `scenes.ts`, `scenes/cast.ts` (`party0`, resets), `scenes/kit.ts` (broom, cigarette).
