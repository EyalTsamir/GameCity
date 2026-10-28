# Requests to other owners ("real things" round)

* **W3 → pedestrians owner (src/sim/pedestrians/vendors.ts, marketStalls):** the stallholder stands behind the
  table facing the back cloth (bench `marketstall 3m`, shots/w3/s3base/marketstall_3m.png): turn the vendor to
  face the aisle (stall front = feature yaw, local +Z).
* **W3 → vegetation owner (src/world/vegetation.ts "planter slots"):** street-planter fill is still a shrub + 4
  flower clumps; props now adds trailing ivy/petunias over the rim and a tall accent (props.ts planter case,
  leaf cards). If the fill is reworked, keep 10 cm free along the rim for the trailing cards.
