# Requests to other owners ("real things" round)

* **W3 → pedestrians owner (src/sim/pedestrians/vendors.ts, marketStalls):** the stallholder stands behind the
  table facing the back cloth (bench `marketstall 3m`, shots/w3/s3base/marketstall_3m.png): turn the vendor to
  face the aisle (stall front = feature yaw, local +Z).
* **W3 → vegetation owner (src/world/vegetation.ts "planter slots"):** street-planter fill is still a shrub + 4
  flower clumps; props now adds trailing ivy/petunias over the rim and a tall accent (props.ts planter case,
  leaf cards). If the fill is reworked, keep 10 cm free along the rim for the trailing cards.
* **W5 → ground-cover owner (src/world/groundcover/mask.ts):** `ctx.services.vegetation.trees[i].worn` (radius, m)
  now marks park / square trees with a trodden bare-earth patch at the foot (vegetation/plants.ts `wornPatch`, drawn
  1.5 cm above the ground). Please clear blade density inside `worn` (and skip the "unmown edge tufts" disc there),
  so grass does not grow through the patch.
* **W5 → W3 / props owner (FYI, done in your files):** `lamp()` in props/furniture.ts takes an optional near kit
  `kf` (W5 lamp-post detail); `picketFence(.., rng?)`, `gateLeaf`, `lowWall` coping, MAT.brick (+ props/material.ts
  brick branch) and the gate placement in the props.ts fence loop are W5 changes.

* **W1 → lead / sky (render/sky.ts) or terrain owner — bright lawn rim at wall feet (judge-1 item 3):** the thin
  yellow-green line along the foot of house / apartment walls persists with `?nograss`
  (shots/w1/rim_nograss/apartment_3m.png on claude/real-w1-facades) → not the groundcover blades. terrain/ground.ts
  already darkens the lawn along walls, so the rim is not the ground mask. Hypothesis: a sun-lit leak strip from the
  shadow normal offset (`sun.shadow.normalBias = texel·0.8·tune.bias`) lifting the wall's shadow off the contact
  line; it shows on walls in their own shade. Probe: `shot.mjs --eval "__city.ctx.services.sky.tune.bias=0; …"` vs
  default at the bench apartment (−137.5, 0.6, −56.5, 4 m, yaw front+18, pitch 10). Buildings already add a dark
  splash zone / plinth on the wall side.
* **W1 → plan owner (core/plan.ts placeHouse):** the driveway runs beside the house; buildings now face garage doors
  to the street (bug 3), but the drive does not lead into them. If wanted: extend the driveway paving across the
  front setback of the footprint's drive-side 3.6 m strip (or flag `lot.garage` so buildings picks the garage plan).
