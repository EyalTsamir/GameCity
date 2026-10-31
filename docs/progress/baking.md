# Baking: compute ahead of time, stay sharp up close

Branch `claude/hopeful-babbage-4a203f`, cut from `claude/pensive-gates-bim12i` @ 5b70883. Not merged, not pushed, not deployed: the user decides after the report.
The user cancelled the assumption "everything is computed in the browser, every run, all in one file". Files baked at build time by our own code are allowed. Everything still comes from our code, quality doesn't drop, and nothing baked may look soft from 1 m. `CLAUDE.md` is updated accordingly.

## Resume here
Done and on by default: far land (`land0`, `land1`) and far facades (`fac0`, `fac1`, `fac2`). Off behind `?pvs`: street-level visibility. See "What is left" at the end.

## Rules for anyone working after this (close round included)
- **`npm run bake` before any perf measurement, in every worktree**, and again after changing a shader or geometry a bake depends on. `public/bake/` is gitignored, so a fresh worktree has none. Takes about a minute; only what changed is redone. A missing or stale file is silent: the picture stays the same and the frame costs up to 7 ms more, which would read as your feature being over budget. Check with `__city.ctx.services.buildings.farBakeKey()` against `public/bake/manifest.json`, or look for `bake/*.gz` requests. You can copy `public/bake/` from a worktree of the same code.
- What invalidates what: `fac*` = the text of the shell materials plus the shell geometry (any edit to the facade shader, `src/world/buildings/materials.ts`, or to the buildings). `land*` = land height and cover plus the land shader. That is deliberate.
- **`FAR_FRAG_MAIN` in `src/world/buildings/farFacade.ts` is a shortened copy of the live terms of `bhWall`** (lit windows, reflection, glint, Fresnel, tint, curtain pane tints, crown). A new term that changes with the hour or the camera in `bhWall` must be added there too, or it stops at the hand-over distance. A new term that doesn't change (albedo, relief colour) arrives by itself with a rebake.
- The far tier takes over at about 100 m (`uFarD`, `?facsoft`), per wall. Close-range work is untouched by it: inside that distance the procedural program runs as before.
- New live programs for far land or far walls cost twice: program size counts on this GPU, even for the path not taken (below). Keep the far programs small.
- Deploy: `npm run bake && npm run build`, then upload all of `dist/`, including `dist/bake/`. See "Delivery".

## Current frame times (60cf93c, 1920×1025, high, ms/frame, AC, 2 interleaved runs per cell, one session)
Baked = today's default. Compare only within a row and a run: the same view has read 2–3 ms apart between sessions.

| view @ hour | baked | no land bake | no facade bake | nothing baked | saved |
|---|---|---|---|---|---|
| overview @12 | 31.9 | 37.1 | 33.7 | 38.6 | −6.7 |
| downtown @12 | 29.9 | 30.2 | 37.3 | 37.4 | −7.5 |
| oldtown @12 | 32.1 | 32.2 | 36.1 | 35.8 | −3.7 |
| park @12 | 29.9 | 30.1 | 34.5 | 34.6 | −4.7 |
| harbor @12 | 33.7 | 33.9 | 37.1 | 37.4 | −3.7 |
| beach @12 | 33.0 | 34.1 | 36.4 | 37.2 | −4.2 |
| westbrook @12 | 31.0 | 30.8 | 35.5 | 35.2 | −4.2 |
| riverside @12 | 31.8 | 32.2 | 35.3 | 35.7 | −3.9 |
| street @12 | 34.5 | 35.0 | 34.9 | 35.1 | −0.6 |
| market @12 | 33.6 | 33.5 | 33.9 | 33.3 | +0.3 |
| overview @18.2 | 30.6 | 35.4 | 32.4 | 37.2 | −6.6 |
| downtown @18.2 | 29.0 | 29.3 | 36.0 | 36.4 | −7.4 |
| oldtown @18.2 | 31.2 | 31.5 | 35.5 | 35.3 | −4.1 |
| park @18.2 | 29.6 | 29.9 | 34.3 | 34.4 | −4.8 |
| harbor @18.2 | 34.0 | 34.4 | 37.6 | 37.7 | −3.7 |
| beach @18.2 | 33.4 | 34.3 | 36.6 | 37.4 | −4.0 |
| westbrook @18.2 | 31.2 | 31.4 | 36.3 | 36.2 | −5.0 |
| riverside @18.2 | 32.6 | 32.5 | 36.5 | 36.8 | −4.2 |
| street @18.2 | 32.6 | 33.0 | 33.4 | 33.5 | −0.9 |
| market @18.2 | 30.9 | 31.2 | 31.3 | 30.9 | 0 |
| overview @21.5 | 32.8 | 38.6 | 34.3 | 39.8 | −7.0 |
| downtown @21.5 | 31.8 | 32.4 | 39.4 | 39.7 | −7.9 |
| oldtown @21.5 | 33.6 | 34.1 | 38.1 | 38.5 | −4.9 |
| park @21.5 | 32.9 | 33.1 | 37.5 | 37.4 | −4.5 |
| harbor @21.5 | 36.9 | 36.5 | 40.3 | 41.1 | −4.2 |
| beach @21.5 | 35.7 | 36.4 | 39.0 | 39.9 | −4.2 |
| westbrook @21.5 | 32.6 | 32.5 | 38.0 | 38.0 | −5.4 |
| riverside @21.5 | 35.4 | 35.9 | 39.4 | 39.7 | −4.3 |
| street @21.5 | 35.2 | 34.7 | 33.8 | 34.3 | +0.9 (spread ±0.7) |
| market @21.5 | 36.2 | 37.1 | 36.5 | 36.1 | +0.1 (spread ±0.6) |

Prices of the switches, noon, mean of the eight far views: facades 4.1 ms (7.4 downtown, 1.8 overview), land 0.9 ms (5.2 overview, 1.1 beach, 0.2 elsewhere).
**At street and market baking changes nothing.** Facades there are 15–25 m away, and that is where the close round spends. The 33.3 ms target is met at noon by overview, downtown, oldtown, park, beach, westbrook and riverside; not by harbor, street and market. Night is 1–3 ms slower everywhere.

## What each bake is
| file | what | size gz | GPU |
|---|---|---|---|
| `land0` | land albedo, near ring, 0.68 m/texel, 2.8 km across | 6.9 MB | 11 MB |
| `land1` | land albedo, polar log warp to 46 km | 4.6 MB | 11 MB |
| `fac0` | facade albedo atlas, 0.085 m/texel | 5.1 MB | 11 MB |
| `fac1` | emission template / 4, 2048² | 0.6 MB | 3 MB |
| `fac2` | roughness, mirror coefficient, metal | 1.0 MB | 11 MB |
Total 18.2 MB beside the 4.4 MB page, fetched in the background after the first frame, uploaded one texture per frame. About 47 MB GPU and 47 MB of JS heap (three keeps the source for a context restore).

What stays live: the sun and moon lighting, shadows, lamps, atmosphere, wind on the land, wetness (a global chunk patch, so the far programs get it), and on far facades lit windows per cell, reflection, glint, Fresnel, tints and the crown. So day, night, golden hour and storm work from one bake.

Land: tiles (band × sector) with one shared index and three draw ranges: procedural, blended, baked; a tile picks by how many pixels a texel covers (`LAND_SOFT` 4, `?landsoft`, `?nolandbake`). Far walls: a second mesh `buildings-shell-far` holds the same walls, and the vertex shader of each program collapses a wall on the wrong side of `uFarD` (`gl_Position = vec4(2,2,2,1)`), so shadow and depth passes and indices don't change (`?nofacbake`, `?facsoft`).

## What looks different (for the user's judgement)
Compared at noon, 18.2 and 21.5, side by side. All kept on because the difference is small and the gain large; each has a switch.
- **Far land, overview:** at 1:1 near identical. At 2× zoom field edges are slightly softer. `?landsoft=3` costs 1.3 ms more at overview and is sharper; `?nolandbake` restores it all for about 5 ms there.
- **Far facades (beyond about 100 m):** very close. Relief is flat at 100–160 m (lit side of cornices no longer follows the sun), sun-reveal shadows are from a fixed noon sun, TV flicker in far windows is gone, tower panes have slightly lower contrast with thin horizontal lines a little more visible, and one small sign strip on a tower's tier shows in the far tier and not near. Shops and roofs stay procedural.
- **Hand-over at 100 m:** per wall, no crossfade. Stills differ little. **Not judged in motion by a person.** If it pops, a dither crossfade is the next step, or a higher `?facsoft` hands over later at a cost (below).
- Nothing changes inside 100 m on walls, or inside about 200–300 m on land. So nothing baked is seen from 1 m.

## Decisions taken without the user (conservative, all reversible)
- 18 MB download on by default: never blocks (the page runs procedural until it arrives), and off for data saver, slow connections, `file://` and `?nobake`.
- GPUs without S3TC (phones) stay procedural: unpacked BC1 would be about 430 MB. Same picture, no saving there.
- Visibility bake off (next section).

## Street-level visibility (`src/render/pvs.ts`): off, `?pvs`
What it was: per 12 m cell at 1.7, 6 and 12 m, per side of a cube, which of 187 static meshes no pixel can show, conservative (only walls and ground hide, a cell keeps what its neighbours see). The main view leaves out what is hidden on all the sides it looks into. Bake 3 min, 30 KB.
Upper bound from hiding everything with no visible pixel in that exact view: street −3.7, market −1.9, static meshes only −2.5 / −1.1.
Measured (2 interleaved runs): street −0.1, market −0.7, walk −0.5, park −0.3 to −1.3, beach walk −0.7. A first version per cell only, all directions: nothing at all.
**Why off:** with it on the GPU context was lost in 3 of about 6 test runs (at a jump between far-apart views), with it off in 0 of 17 (including the frozen base). No driver reset in the Windows log, no Chrome crash dump, the page comes back by itself. Both hide mechanisms did it (`drawRange.count = 0` in `onBeforeRender`, and `visible = false` from `scene.onBeforeRender` with a restore before the shadow pass). Cause not found. Half a millisecond isn't worth any chance of a black flash. Worth another look only with a real need at street level and a different driver.

## Tried and left
| what | result | why left |
|---|---|---|
| Near-only tiers: foreground limit on the land | about −1 at overview, +0.5 at beach | the land's cost is in the overview's foreground |
| One big program with a per-pixel branch | 2 ms more than a separate small program, even with every pixel on the cheap side | program size costs on ANGLE/Adreno. Hence separate programs chosen by geometry |
| `uDetail=0` as a no-bake far facade | visibly loses the towers | |
| Facade atlas at half density (.17 m/texel) | visibly blurred at hand-over | |
| Land soft 2 / 3 / 4 | −0.3 / −3.6 / −4.9 at overview | 4 chosen, difference small |
| 8192 land, branched program | −3.8 at overview | superseded by tiles with a separate program at 4096 |
| RGBA8 instead of BC1 | looked the same | softness is density, not compression |
| Shell split alone (`SHELL_SPLIT`) | nothing per frame | kept because the far tier needs the wall class |
Not tried, ideas with numbers: far trees (2.9 ms at overview, already an atlas), texture-space caching of near facades at street (7 ms for 25 % of the screen, a runtime cache, not a build bake, and the close round is editing that shader), roofs and shops in the far atlas. Atmosphere (`?noatmo` −3.5 / −2.2 / −0.9 / −2.5) and shadows are live by nature.

## Why these and not what the logs proposed
Upper bounds, 5b70883, the whole term removed (overview / downtown / street / market):
| what | overview | downtown | street | market |
|---|---|---|---|---|
| facade procedural part stubbed (keeps lighting) | −2.5 | −8.8 | −6.2 | −5.4 |
| same with two texture fetches | −2.8 | −8.8 | −6.2 | −5.4 |
| land procedural part stubbed | −6.7 | −0.6 | 0 | −0.1 |
| shadow sampling off | −3.4 | −3.0 | −2.4 | −3.7 |
| aerial perspective off | −3.5 | −2.2 | −0.9 | −2.5 |
| lamp light returns 0 (noon) | −2.4 | −0.9 | −0.9 | −1.2 |
| IBL fetches replaced by constants | 0 | −0.1 | 0 | 0 |
The procedural part is nearly all of what a facade or land pixel costs; a fetch costs next to nothing. **The land is the first candidate at the overview, not the facades** (the logs and the brief said facades): facades there are 6 % of the screen.

Facade pixels by distance (share of screen, then of those pixels):
| view | screen | distances |
|---|---|---|
| overview | 5.9 % | 97 % at 500–800 m |
| downtown | 44 % | 20 % at 100–150, 55 % at 150–200, 23 % at 200–300 |
| oldtown | 45 % | 44 % at 60–100, 36 % at 100–150, 20 % beyond |
| park | 24 % | 30 % at 100–150, 58 % at 150–200 |
| harbor | 15 % | 62 % at 150–200, 37 % at 200–300 |
| street | 26 % | 88 % at 15–25 m |
| market | 28 % | 24 % at 10–15, 71 % at 15–25 |
| walk | 9 % | 75 % at 40–60 |
Land variants on the way (overview / beach / westbrook / riverside, delta ms):
| variant | overview | beach | westbrook | riverside |
|---|---|---|---|---|
| far-only program on all land, 4096, one log warp | −6.1 | −3.7 | −1.3 | |
| near band by whole rings | −0.1 | −1.1 | 0 | |
| one program with a per-pixel branch, soft 3 | −0.8 | +0.1 | −0.1 | |
| same, soft 6 | −3.2 | −0.5 | −0.2 | |
| same, 8192 soft 4 | −3.8 | −0.9 | −0.3 | −0.1 |

## Delivery
- `dist/index.html` (4.4 MB, JS and CSS inlined) still opens from `file://`: `fetch` is skipped there and it runs procedural, the same picture without the saving.
- `npm start` / `Launch Tinyhaven.cmd`: served locally, uses `dist/bake/` if `npm run bake` was run before the build. The launcher doesn't bake (Chrome and a minute of GPU); `public/bake` stays until the code changes.
- File names carry the fingerprint, so no cache can pair a new manifest with an old file. gzip is inside the file and the magic number is checked, so a host that decompresses or not makes no difference.
- **Netlify:** `npm run bake && npm run build`, deploy `dist`. **GitHub Pages:** `gh-pages` must now contain `bake/` too. Neither host tested with these files yet: nothing was deployed. Check on the first deploy that `bake/*.gz` arrive (network tab) and that downtown is faster.
- `bakeOn` needs no server support, no CORS (same origin).

## Tools
`scripts/bake.mjs` (`--only`, `--force 1`, `--url`, `--raw`, `--sharp`, `--out`), `scripts/bc1.mjs` (our own BC1 encoder with sharpened mips). A stale bake never looks wrong; only frame time shows it.
Harness lesson: WebGL query results arrive only after the task ends, so a bake must yield with `setTimeout(0)`, with the frame loop's `ctx.render` replaced by a no-op meanwhile.

## What is left
Filled in by the final checks below.
