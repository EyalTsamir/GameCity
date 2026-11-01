# Close life: small movements anywhere you walk

Stage 3 of `CLOSE-ROUND.md`. Port 5220, branch `claude/suspicious-goldstine-2c9651`. Time limit 14:00 on 2026-11-01. End the last message with CLOSE-DONE. Master switch `?nosmalllife`, one `?no<name>` per feature (`src/core/closeLife.ts`).

## Resume here
Dev server: `npx vite --port 5220 --strictPort --host 127.0.0.1` from this worktree (`npm ci` done). `npm run bake` not yet run: run it before any perf.
Tool: `node scripts/lifeseq.mjs --out <abs>.png --at "x,y,z,d,yaw,pitch" [--find birds:1|talk|dog|cat|litter] [--pre js] [--eval js] [--walk 1.3] --frames 12 --every 300`: sheets of frames in real time, shared browser lock. Its header lists the options. `__city.ctx.services.smalllife`: `birds.tame = true` keeps them still for a close look, `birds.scare()`, `litter.blow()`.
Patches: heredocs with apostrophes break in this shell. Write a `.cjs` into the scratchpad. Sources may be CRLF in this working copy.

## Audit (2026-11-01, noon, ordinary places at 3 and 10 m)
The city holds up at 3 m but pavements are dead: nothing lives below knee height, no bird, leaf or scrap of paper anywhere except the three pigeon flocks on plazas. Already there and extended, not duplicated: pigeons (3 plazas, `ambient/birds.ts`), falling leaves that vanish after a few seconds (`life/drift.ts`), dogs at a fixed offset from the walker (`figure.ts`), one talking-hand pose (`animate.ts` IDLE.TALK), phone and coffee, waiters (`cafes.ts`), scenes.

## Done so far
| feature | toggle | where | cost |
|---|---|---|---|
| Street birds: sparrows, pigeons, blackbirds, gulls by place, per bubble cell; flush on a wave of alarm, go to a crown or roof, come back | `?nostreetBirds` | `smalllife/streetBirds.ts`, `birdBody.ts` | about 400 tris each, at most 56 |
| Leaves, newspaper, flyers, cups, paper balls, moved by gusts, cars and feet, gather at kerbs and walls | `?nonearLitter` | `smalllife/litter.ts` | 3–4 instanced draws, no shadows |
| Gestures: phrases of real gestures for speakers, nods and a shared laugh for listeners, fidgets for people waiting, near level only | `?nogestures` | `smalllife/gestures.ts`, a block in `pedestrians/animate.ts` | CPU only |

## Left to do
Cats, dogs (sniffing, lead, close model), waiter check, doorway people.

## Changes outside my files
`src/main.ts` one module line. `pedestrians/animate.ts`: import, `poseIn.near`, `headRoll` now `let`, one block before "walking with a takeaway coffee". `pedestrians/render.ts`: sets `poseIn.near`.
