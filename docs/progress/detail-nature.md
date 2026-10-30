# detail-nature — nature and the horizon (detail round, 2026-10-31)

Owns `src/world/vegetation*`, `src/world/groundcover*`, `src/world/landscape*`. Port 5204. Rules: `DETAIL-ROUND.md`.
Switch file: `src/core/nature.ts` (`?nonature`, `?no<feature>`).

## Resume here
Round 1 started. Dev server: `npx vite --port 5204 --strictPort --host 127.0.0.1`. Captures from the main checkout with
`--url http://127.0.0.1:5204/`, output into `shots/nat/` of this worktree (ignored).

## Audit, round 0 (shots/nat/a0, a1: 25 views at 11 and 18.2)
What reads as fake, ranked by how much of the first impression it costs:
1. Overview foreground: fields are flat pastel quads that end in a bevel on a blank sand strip. Half the hero shot.
2. Eye level in a field: flat colour bands with sparse straw sticks (`outer.ts`: fields get 12 % density long grass).
3. Country trees: all one lollipop (trunk to 48 % of the height, dark plum bark, leaf cards as big as a table), far too
   many hedgerow trees for the size of the plots. City trees are far better than these.
4. At 18.2 country trees are near-black teal silhouettes (backlit, translucency too weak).
5. Hills at 1–4 km are felt with a few specks: the villages are at 1.7 km W and 1.65 km S, none on the hills in frame.
   No power lines, no road leading the eye, no spire on the skyline.
6. Beach and dunes south of the town: empty tan strip.
7. Forest interior: near-black floor, huge plain trunks. Hedges in the west lane: clay lumps with sparse cards.
8. River banks: reeds are sparse sticks, flat grass, no willows that read as willows.
Good already: park planting, city trees, mountains' silhouette, hamlet from 120 m.

## Plan
- A. Row strips (`landscape/rows.ts`): alpha-cut leaf-wall ribbons, one atlas, static merged mesh. Vineyards, maize,
  sunflowers, hedges, windbreaks; rows and their shadows are what make a field read as farmed. Plus bales, polytunnels.
- B. Blades know the crop (`groundcover/outer.ts` + `field.ts`): wheat stands, maize, stubble at eye level, no new vertices.
- C. Country tree shapes, bark, leaf size, species; fewer and clumped hedge trees (saves impostors).
- D. Golden-hour colour of country trees.
- E. Coast: meadow belt before the dunes, marram, sand fences, shacks.
- F. Horizon: hill towns with campanile, road, power line, ridge monastery.
- G. Forest floor, hedges, kerb planters, river banks.

## Log
