# Close vehicles: trains (close-up round)

The sister of `close-vehicles.md` for `src/sim/rail/*`: a close level for every car by system, by the same method.

## What
- `trainRender.ts`: per car type one more InstancedMesh set, `rail-<type>-close` (body, casts shadows), `-inner` (saloon, cab; no shadow caster),
  `-glass` (panes). Same instance buffers per set. A car goes to it by the same distance logic as road vehicles (`CLOSE_DIST` 18 m in the
  reference view), nearest point of the car body; a car half in a tunnel mouth stays on the far level, because the close programs have no discard.
- `trainMaterial.ts` `make(near)`: defines `TR_NEAR`, `TR_CLOSE`, `TR_GLASSPASS`. The far program keeps its size (all behind `#ifdef`). Close
  programs have no `gl_FragDepth` and no `discard`, so early-z works for them.
- `closeGlsl.ts`: shading by tiles. `closeModel.ts`: saloon, cab, door leaves, bogies, lamps. `trainModels.ts` assembles through `CloseHooks`.

## Switches
`?novehtrain` (this level), `?noclosevehicles` (all close vehicles). Off on quality `low` (`closeVeh(ctx, 'vehtrain')`, min medium).

## Numbers
See the end of this file once measured.

## Left
Being worked on.
