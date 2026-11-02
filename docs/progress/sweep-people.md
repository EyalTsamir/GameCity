# Sweep people: hair, hats, arms, hands, clothes (stage 4, 2026-11-02)

Goal from the user: someone walking the city says "wow, the AI thought of everything"; nothing reads as a plain shape where "the AI just didn't think here". The list came from the judges' sweep (`sweep-findings.md` on `claude/gifted-goldwasser-f1fa64`, sections `people-mannequin-stiff-blank`, `objects-interpenetrate-geometry`, `hands-miss-held-objects`, `ped-*` rows). Faces stay as they were, by the user's decision. Base: the close-people round (`close-people.md`).

**Switches.** `src/core/sweepPeople.ts`: `?nosweeppeople` turns everything here off, `?no<name>` one fix. No tier of their own: everything lives on the close level (`Lod` close, `cfg.close`, VS flag CL, program `PED_CLOSE`), whose range (7 / 11 / 15 m by quality, budget 14 figures) is the tier, as in close-people. Three small changes are unconditional because they are plain bugs: the manbun hidden under hats, the shared hat table's bucket droop and thickness (`SH`, `SB`, `FB_` are switched, droop is not), a stray tuck line.

| Fix | Switch | What |
|---|---|---|
| Hats | `hatform`, `hatcloth` | Each hat its own form in the VS: brim wander, fedora snap and pinch, hard-hat peak and ridge, beanie cuff; own cloth in the FS: cap panels, eyelets, button and stitched peak, tweed, plaited straw, felt, plastic, knit, bucket stitching. Spec off except the hard hat. Brim with a rolled lip ring, visor a crescent |
| Hair tone | `hairdepth` | Bright hair lost its flat paint: darker body, broad darker gaps along the flow |
| Hair hem | `hairhem` | Broad uneven clumps at a sheet's end, hem wanders in long curves |
| Curls | `curls` | Round curls from products of sines (value noise showed cell corners through the derivative bump), no comb-straight sheen |
| Hairline | `softline` | Thinning to skin, no teeth |
| Long hair | `hairfall` | Sheet starts round the face, falls from the skull, ears and earrings under it, front edge whole |
| Long hair from behind | `hairledge` | Cap and sheet share a normal field, tone and the cap's lift: was a bowl sitting on a curtain; black hair shows its locks. Same lift on ponytails and buns, tighter ponytail root |
| Shoulders | `shoulders` | Ball normal field where arm and torso cut each other; the shoulder rolls with the arm. Doesn't move the arm's pivot, so every grip's IK stays right |
| Dots | `seamdots` | Seam heights far smaller (a 1–2 px seam as a height is a row of dots), weave grain fades earlier (moire), no fold step down the back of a sleeve (the angle jumps by 2π there) |
| Straps | `straps` | Padded backpack straps with a buckle and webbing round the ribs, crossbody strap in one curve with an adjuster |
| Hands | `grips` | Fingers bend round what they hold (bend deformer: rho = U/G), a thumb that comes to meet them, a level cup, phone on the fingers with a screen, briefcase hanging from a bail, carrier bags on cords lowered to the fist |
| Printed props | `propprint` | Newspaper: an open sheet with a fold, masthead, columns, a photograph; carrier bags with a printed mark per bag |
| Clothes | `clothes` | Creases and drag lines on tops, roll above a hem, shadow under a hem, belts on tucked shirts, socks on bare legs, side seam a thin line ending at the hem |
| Shoes | `shoes` | The toe rounds off in plan and section |
| Long tops over thighs | `jackethem` | The pelvis goes in behind the thighs at this level, so a jacket hanging below them was cut off in a torn edge over each leg. The thigh now wears the jacket to the hem's height (`vPedTop`, FS paint, no vertices): one hem line, and it swings with the leg |
| Lapels, collar, tie, hood | `lapels` | On the torso's true surface (`buildCloseLapels`: same Catmull-Rom and yoke as `buildTorso`): lapels with a roll, a notch and a shadow under the edge, on a narrower opening; shirt collar with its foot in the yoke and two points; a tie from a knot that goes in under the jacket; a hood lying on the shoulders instead of a ball |
| Hip line | `hipline` | Up in the hip a thigh's normal stays with the pelvis (`pedHipKeep`): swung with the thigh it drew a wandering line across the trousers |
| Neck foot | `neckfoot` | One normal field from neck into yoke: a paler ring round the foot of every neck is gone |
| Vests | `vestarm` | A hi-vis vest has an armhole, cut in paint (`vPedTop`, w < -1.5): its colour against the sleeve's made a torn edge at the shoulder |
| Riders | `riderlegs` | A skirt stays off the saddle: those riders get trousers (bare legs to the hip under a dress's top read as a leotard) |

**Near level, on purpose.** Everything above is the close level except: near hair sheen halved (`hairdepth`), near hairline blend narrower and darker (`softline`: it was a grey band round dark hair), near straps bend once over the chest (`straps`: a straight stick came out as dashes). Near keeps its old wide jacket opening and flap lapels, so a suit changes a little at the handover (7 to 15 m).

**Lessons.** A bright band or dot row at a boundary is nearly always a step in a height seen through 2×2 derivatives; take the step out rather than the detail. Two surfaces meeting need the same normal *after* posing, not only at rest. Before adding geometry check whether paint on the mesh that's already there does it (`jackethem` costs one flat varying).

**Lab.** `scripts/lab/people.ts`: `hat`, `hair`, `hairlen`, `hairvol`, `fringe`, `hc`, `walkprop`, `flag`, `hf`, `reading`, `suit`, `hood`. Note the lab's `suit` keeps the top's print on the jacket and `hair=bun` on a long-haired look keeps the sheet: neither happens in the crowd.

## Perf (2026-11-02, 17:49–19:06, on AC, behind `power-guard.mjs`)

`abprof.mjs`, hours 12, 6 cycles of 2 s, A/B = close level on vs. closeDist 0.01 (everyone on near) in one page. Sweep on = plain URL, sweep off = `?nosweeppeople`. Cost of the close level, ms:

| View | Sweep | Run 1 | Run 2 | Frame, run 1 / run 2 |
|---|---|---|---|---|
| street `5,1.5,-65,9,0,6` | on | 2.3 ±1.06 | unusable (±16.46, a stall) | 41.67 / 50.86 |
| street | off | 1.61 ±0.64 | 1.5 ±0.87 | 40.16 / 40.47 |
| market `27.5,1,78.5,16,200,28` | on | 0.18 ±0.19 | -0.08 ±0.55 | 37.59 / 37.58 |
| market | off | 0.17 ±0.34 | unusable (4.15 ±5.43) | 37.64 / 40.89 |

**Against the +0.5 ms limit: market passes, street is not shown to pass.** Street's best estimate is +0.7 to +0.8 ms for the close level, over the limit, with an error of about ±1.2 ms, so it could be under it too; only one clean sweep-on run. Frame totals across page loads say +1.2 to +1.5 at street, but CLAUDE.md puts reloads at ±1–2. Nothing was trimmed: the runs ended after the 18:30 limit, and there's no measurement yet to say what to trim. Next step if wanted: repeat street with more cycles when the capture is over; the added vertices are small (about 1.2 k triangles × at most 14 figures ≈ 0.04 ms at 2.5 ns each), so look at the fragment paint first.

Overview check on the same head (`shot.mjs --stats --invariants --validate`): no console errors, no failed modules, no frame errors, invariants and validate empty. Typecheck clean. `npm run build` not run.

## Resume

**Seen on the last portrait sheet (city, real GPU, 1.6 m), not fixed:**
- Short hair with a fringe (men 21 and 38, woman 26) still reads as a bowl with a toothed edge across the forehead. Hair item of the list: better, not finished.
- Long grey hair (woman 57) looks glassy, like a pale translucent sheet down the sides of the face. Not investigated; may be the sheet's lift on very pale hair.

**Not checked in the city:** hair moving while walking (the picked man stood with a phone); hands at close framing (the sheet framed the hips; grips were checked in the lab); handlebars (only the sweep's old picture).

**Known leftovers:** near keeps the wide opening and flap lapels (small change at the handover, 7–15 m); chevron facet at the knee on bare shins; the hood's blunt ends; the tie's small step on women's suits; crossbody strap kink at a lapel; beard and moustache edges (left with faces); hip line still faint on some dark trousers; hi-vis side dots seen once, not investigated.
