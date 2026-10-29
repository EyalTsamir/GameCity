# F2 — People everywhere (final fix round)

Branch `claude/real-f2-people` (from `claude/pensive-gates-bim12i` e1c9780). Brief: real-briefs.md "F2".

## Resume here
* 2026-10-29 session 1 STARTED. Reading done: riders.ts is the pattern (extra Members posed by animate.ts, passed
  to `CrowdRenderer.write(.., extra, nExtra)`). Plan: `pedestrians/actors.ts` = a module-level registry other
  modules feed (person() / figure() / vehicles), drawn as extra posed Members.

## Code pointers
* riders.ts: `Riders.sync()` per frame → `list`/`n` → render.write extra. Member fields: rideG (RideGeom seated
  pose: mode 2 = seated, feet on a floor, hands at bar ±barX,barY,barZ), sit/seatH (bench), forceIdle (IDLE
  0 relaxed … 8 guitar, animate.ts:78), chat, carry (waiter), faceYaw.
* person(): landmarks/parts.ts:202 (calls: construction.ts:445 workers, park.ts:557 band, :568 conductor, :790 kids).
* Vehicle occupants are ray-traced in the glass shader: traffic/vehicleMaterial.ts `thInterior` (~l.357; bus
  passengers ~l.382, bus driver ~l.392, car driver ~l.434); trains rail/trainMaterial.ts ~l.239.

## Done

## Tried and rejected (why)

## Toggles / tiers / costs

## Next
