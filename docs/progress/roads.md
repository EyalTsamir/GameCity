# roads module — progress (builder agent)

Owner files: `src/world/roads.ts`, `src/world/roads/*` (builder, streets, covers, surfaces, materials, markings).
State at pause: module loads, `tsc` clean for my files, invariants empty (movement curves stay on the carriageway).

## Design (implemented)
- 3 draw calls, renderOrder -1 (drawn before terrain → grass under hardscape is depth-rejected; measured big win):
  asphalt (roads, junctions, tunnel roads, parking, schoolyard) · hardscape (sidewalks, curbs, gutters, ramps,
  covers, promenade, boardwalk, paths, shoulders, sides) · markings (paint + glyph atlas, alphaTest, polygonOffset).
- Heights: asphalt 0.010 · gutter 0.014 · shoulder 0.012 · covers 0.020 · paths 0.030/0.035 · walk/promenade 0.15 · deck 0.30.
- Junction curbs = chains walked clockwise between present arms (`streets.ts junctionChains`): concave fillet R=2.5,
  straight across missing arms, convex R=3.5 at bend outer corners. Dropped kerbs (linear ramp + flares) at every
  crosswalk end, tactile paving (per-vertex d/along in aS.xy). Segment strips share the same row offsets (no cracks).
- Covers: per-block rectilinear partition (top layer wins), emitted on shared grid lines (no T-junction cracks).
- Hardscape shader is now SINGLE-PATH parametric (`surfaces.ts` table → per-vertex aS/aP/aV/aC/aX); specials only
  tactile / radial rings (civic fountain, park statue) / grass creep. All fwidth + texture fetches hoisted.

## Done
- [x] builder, materials (noise tex, asphalt: aggregate/mottling/tyre tracks/oil/patches/rain; paint wear + sub-pixel fade)
- [x] carriageways, curbs+chamfer, gutters, sidewalks by district style, dropped kerbs + tactile, back faces/caps
- [x] tunnel roads into the bores, gravel shoulders, kerbed service ledges in the bores
- [x] covers (plaza/bpave/setts/concrete/quay/platform/gravel/sand/pitch/pavers/allotment beds), promenade (raised),
      boardwalk deck + fascia + kiosk bump-out, park/riverbank path ribbons with ragged edges + skirts
- [x] markings: centre lines (dashed/solid, avenues double), stop lines (7.15–7.5), zebras (worn in wheel paths),
      STOP text, lane arrows, bus boxes ("BUS"/"STOP" stacked — changed, NOT yet re-verified), level-crossing
      keep-clear hatch + stop lines + X, parking stalls, pitch lines, school court + hopscotch, quay yellow line,
      cycle symbols, manholes, gully grates, sidewalk lids
- [x] perf: downtown 5 s interleaved ×3 → 14.49 vs 13.77 ms (≈0.72 ms, budget 0.8) AFTER shader restructure

## Next (priority order)
1. VISUAL re-check of the new single-path hardscape shader (not yet screenshotted!): "0,0,-65,45,30,50", downtown,
   "27,0,25,50,20,45" (radial rings), "119,0,24,34,70,38" (boardwalk/bus box), "-27,0,72,60,0,60" (pitch), allotments.
2. Measure overview cost (`perf.mjs --view overview --seconds 5 --variants ";skip=roads;;skip=roads"`); trim if > 0.8 ms.
3. Night (--hours 21) and rain checks; z-fighting check from overview (two shots 500 ms apart).
4. Cleanup: unused rdGrid/rdBond in materials COMMON, `dirOf` + unused `start` var in markings.ts (field corner arcs),
   `for (const g of [A, H]) void g;` in roads.ts; keep debug toggles (roadsRO, roadsFlat=a|h|1, roadsLambert).
5. Nice-to-have: sidewalk slab orientation per street axis, driveway crossovers, stadium-block paving tone.

## Known issues
- Beach POI renders the left ~55% black — also with `skip=roads` → not roads (postfx / another module). Report.
- Stadium building not drawn by anyone yet → block paving (bpave) visible around the pitch.
- Traffic sometimes stops inside the level-crossing keep-clear box (traffic module).

## Best views
- downtown · "0,0,-65,45,30,50" · "-55,0,-10,45,20,50" · "-53.5,0,-113,16,8,22" (driver view, STOP + kerbs)
- "-110,0,-150,48,25,42" (tunnel road + level crossing) · "27,0,25,50,20,45" · "119,0,24,34,70,38" · overview
