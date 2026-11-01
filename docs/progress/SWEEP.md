# City sweep: stage 4 of the close-up round (2026-11-01)

The user's idea: divide the city into small squares and look at each one on its own for anything not real enough, such as an ice-cream stand made of rectangles or stadium people who aren't believable. In their words, the goal is "יפה אמין אמיתי שיראו תשומת לב בכל דבר בכל פינה בעיר". No gameplay, no sound work, no external assets. Everything is fixed by system across the city, never as a one-off place. `CLOSE-ROUND.md` still applies, and this file overrides it where they differ.

**Nobody will answer a question.** Take the conservative choice, log it and carry on. Each session waits for the coordinator's start message.

## Sessions
| session | port | job |
|---|---|---|
| city-sweep | 5230 | capture tool, census, pilot, judges, ranked findings |
| sweep-fix-a … d | 5231–5234 | fix the families the coordinator gives them |

## What city-sweep builds
1. **A census** of every kind of thing in the scene, read from the data: landmarks, features and props in `plan.ts`, street furniture, stalls, kiosks, buildings by kind, vehicles, boats, trains, people groups, animals, and each variant of a kind. A thing that appears once counts like one that appears a thousand times. Write it to `docs/progress/sweep-census.md`.
2. **`scripts/sweep.mjs`**, the capture tool, with two parts:
   - **Objects:** the camera goes to each census kind and variant, and shoots from 1, 3 and 10 m at noon and 21.5.
   - **Squares:** 10 m cells on walkable ground (roads, pavements, squares, parks, quays, paths), 20 m on the rest of the 400 × 340 m slab (`SLAB` in `core/constants.ts`), larger cells beyond it. Eye-height views in four directions, plus one looking down at the ground, at noon and 21.5. Open water with nothing on it is skipped or gets one view.
   - **Requirements:** keep one page open per code version (a boot takes about 35 s and most short runs are boot); resume from a stop point after a crash or a power drop; write into `shots/sweep/<part>/<cell or kind>/` with an index file of position, view and hour; stop if the disk falls under 5 GB. People and traffic must be visible, so let the city run before shooting. It uses the shared browser lock like any harness script, and images are looked at, so it may run without the power guard.
   - **Size:** aim for 5,000–10,000 images, 3–7 hours on this laptop. Measure the real seconds per image first. Over about 20,000 images, thin the views rather than the cells.
3. **The pilot, before anything large:** capture a few cells and kinds with known flaws, the ice-cream stand and the stadium people among them, plus some ordinary ones. Run the judges on them. If they miss the known flaws, change the framing or the instructions and try again. Measure what a judge costs in quota per image, compare a cheaper model with the current one, and choose the cheapest that still catches the flaws.
4. **The full capture**, when the coordinator says the machine is free of other sessions.
5. **The judges:** image-only subagents with no browser, under 10 at a time, each given one cell or kind at full size, never contact sheets. Each looks only at what it was given and asks what reads as fake, repeated, flat, floating, cut off, wrongly lit or there for no reason. It reports the exact thing, the image, why it reads as fake and how noticeable it is. Don't send a judge a list of suspected flaws: it should report what it sees.
6. **The findings:** `docs/progress/sweep-findings.md`. Merge everything into families, one cause with many instances, ranked by how much of the city it touches and how badly it reads. For each family give example images, the likely owner in the code and a rough cost. Check the top families yourself by eye before ranking them; a judge's claim is not proof. Report what wasn't covered.

Quota: stop the judges at 90 % weekly or 95 % 5-hour, end your turn with PAUSED-FOR-QUOTA, and make the run resumable.

## What the fix sessions do
Each gets a list of families from `sweep-findings.md`. Fix each family everywhere it occurs, by system, with a master switch in your own `src/core/sweep<name>.ts` and a quality tier. Check by eye on the listed images and on places the judges didn't list. Budget per session: +0.2 ms at overview and downtown, +0.7 ms at street and market, as in `CLOSE-ROUND.md`. Final checks as there, and end with CLOSE-DONE. Use `npm run bake` in your own worktree. Don't merge, push or deploy.

## After the fixes
The coordinator merges and measures, then city-sweep re-captures what changed and judges it again.
