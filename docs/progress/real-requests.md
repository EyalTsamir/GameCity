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
* **W2 → plan / station owner:** the platform edge stands 2.0 m from the track centre (`plan.ts` station
  `platform: rect(-46, RAIL_Z + 2.0, …)`) while the EMU body side is at 1.45 m, so a 0.55 m gap with sleepers shows
  between platform and train at 3 m (real: 0.1–0.25 m; UK/EU platform edges ≈ 1.6–1.7 m from the centre). Suggest
  `RAIL_Z + 1.65` if the platform face / copers and rail clearances allow it (freight wagons are ≤ 1.45 m wide too).
