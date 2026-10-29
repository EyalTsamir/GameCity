# Buildings massing round — log

Branch `claude/buildings-massing-f65621` (based on `claude/pensive-gates-bim12i` @ a200754). Goal: ordinary buildings
read as architecture, not "a box with a triangle on top" — break the volume (oriels, turrets, cross gables, setbacks,
crowns, roof furniture). Landmarks are not in scope (boxhunt session); plan.ts layout untouched (places session).

## Resume here
- Done (code, typecheck clean, NOT yet visually verified): `src/world/buildings/massing.ts` kit + townhouse oriels /
  corner turrets / cross gables, tower setbacks / notches / crown cornices, roof kit on flat roofs (townhouse flat,
  tower setback strips, apartment slabs), explore rooms follow tiers.
- Next: review shots (`shots/t1`: oldtown, ot_w, ot_n, ot_air, mkt) → fix → downtown/tower shots → perf
  (`perf.mjs --views "overview;street=5,1.5,-65,9,0,6"` with `;nomassing` variant) → before/after sheets → build.
- Baseline shots: `shots/before/*_11.png` (overview, downtown, oldtown, westbrook, industry, harbor, street).
- Dev server for this worktree: `npx vite --port 5185 --strictPort`; harness from `C:/Projects/GameCity/scripts`.

## Toggles (all on by default)
`?nomassing` (all off) · `?nooriels` · `?noturrets` · `?nocrossgables` · `?nosetbacks` · `?nocrowns` · `?noroofkit`.
Quality: low keeps the massing (it carries the skyline, few triangles) and drops the roof kit; cornice brackets
only from medium.

## Design notes
- Massing decisions use `massRng(g)` (a separate per-lot stream) so a toggle never reshuffles the rest of a lot.
- Townhouses (oldtown.ts): turret on ~55 % of corner houses (front corner on an exposed side, ≥3 floors), octagonal,
  corbelled from the first floor, cone / bell / dome cap, R ≤ 1.3 m (footprint overhang ≤ 1.2 m); front / side window
  grids leave the turret span clear. Oriel on ~42 % of fronts (box or canted, one or two window columns, shops from
  the second floor up), front window trims / balconies skip its cells. Cross gable (knee wall + gable + own roof meeting
  the main slope) on ~42 % of side-gabled houses (75 % when there is an oriel — it is centred on it), replacing dormers.
- Towers (towers.ts): masonry schemes → wedding-cake setbacks (H > 30) or a set-back top storey; glass → asymmetric
  setback / notched corners / set-back top storey (flat & screen crowns only; stepped & slant schemes keep theirs).
  Masonry tiers get `crownCornice` (frieze, bed moulding, corona on modillions). Setback roofs get `roofKit`.
- Explore (src/ui/camera/explore.ts): `services.buildings.massTiers` (lot id → world rects from y0) — rooms and
  `lotAt` use the storey's tier rect.

## Files touched
src/world/buildings/massing.ts (new), oldtown.ts, towers.ts, houses.ts, anchors.ts (service type), buildings.ts,
src/ui/camera/explore.ts.
