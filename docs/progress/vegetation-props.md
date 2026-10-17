# Vegetation + Props — progress (COMPLETE; both modules load, tsc clean in my files, console clean)

Owner files: `src/world/vegetation.ts`, `src/world/vegetation/*` (geo.ts merged-geometry builder + Shaper,
species.ts trees/bush/hedge, plants.ts flowers/beds/crops/reeds/lilies/grates, material.ts wind),
`src/world/props.ts`, `src/world/props/*` (layout.ts = shared deterministic layout + LOD/culling helpers for
BOTH modules, furniture.ts models, material.ts furniture+glass, glow.ts pools/halos).

## Done
- Vegetation (~960 trees: ~470 hill forest, 91 street, park groves, gardens, courtyards, plazas, river, beach):
  lobed-union canopies with per-lobe normals + seam AO; species round/blossom/autumn/fruit/birch/column/conifer/
  palm/willow; bushes, clipped hedges (crisp faces), flower beds, planter flowers, allotment crops (rows, sheds by
  props), pond reeds + lily pads, island willow + birch. Wind sway (aWind, gust fronts, flutter) incl. shadows.
- Props: lamps by district (modern/classic/simple/suburb/beach) + park/riverbank/boardwalk/plaza path lamps with
  emissive heads + additive pools/halos; benches (plan + slots, heights match pedestrians — verified sitting),
  bins, hydrants, bike racks + bikes, planters, mailboxes, phone boxes, newsstand, glass bus shelters (route
  colour pole/roof stripe, lit ad panel), picket fences / brick+stone walls with gate pillars, plaza bollards,
  allotment sheds + water butts.
- Draw calls: vegetation 6 near (trees+shadow, forest+shadow, plants, fine plants) / 5 far; props 4.
- Distance LOD (LOD_DIST 300 m): far tree copy (same lobes/colours), fine plants/props hidden.
- Perf (perf.mjs, 12h, alternating medians): park ~1.43 ms, westbrook ~1.6 ms, overview ~1.19 ms (budget 2.0).
- Debug toggles: `?vegparts=trees,forest,plants&vegshadow=0&vegmat=standard|lambert|basic&propsparts=furniture,glass,glows&propsmat=basic`.

## Known issues / notes
- West/east chunk culling was tried and measured useless (diorama views see across the board) → disabled
  (CHUNK_X = -1e9 in layout.ts); kept the culler as the LOD gate.
- perf.mjs is noisy (other agents) — use alternating repeated variants and medians.
- Willow is stylised (dome + ribbon strands).

## Best views
- park `--view park`; park close `--view "-60,0,17,45,15,28"`; gardens `--view "-150,0,30,50,-40,40"`;
  allotments `--view "-184,0,-111,42,-15,45"`; civic benches `--view "27.5,0,25.5,30,0,38"`;
  hills (no buildings) `--q "only=sky,terrain,water,vegetation,props,postfx" --view "0,10,-170,160,0,32"`;
  bus shelter `--view "-3,1,-91,22,-12,24"`; night `--view oldtown|park|westbrook --hours 21.5 --wait 4000`.
