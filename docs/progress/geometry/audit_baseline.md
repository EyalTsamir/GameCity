# Geometry audit — http://127.0.0.1:5191/?adaptive=0&nointro&noidle&nowarmup

Renderer last frame: 251 draw calls, 4.82 M triangles (all passes). Scene: 334 meshes, 4.16 M triangles if everything drew once.

| defect | triangles / parts |
|---|---|
| degenerate | 23487 |
| sliver | 9688 |
| flipped | 5306 |
| coincident same winding (z-fight) | 58572 |
| coincident back-to-back (internal) | 58745 |
| buried | 54523 |
| bottom on the ground | 12714 |
| floating parts | 1034 |
| sunk parts | 1730 (19416 tris) |
| inside a building | 97 |

## Triangles by module (every mesh once; LOD siblings and hidden meshes included)

| module | meshes | tris | shadow casters |
|---|---|---|---|
| landmarks | 31 | 838863 | 324715 |
| props | 63 | 644153 | 18299 |
| landscape | 30 | 581988 | 198778 |
| buildings | 30 | 350997 | 343793 |
| vegetation | 22 | 309043 | 161880 |
| traffic | 79 | 252506 | 205262 |
| harbor | 8 | 219686 | 218812 |
| rail | 23 | 208653 | 50179 |
| terrain | 5 | 176158 | 53655 |
| boats | 5 | 172337 | 168467 |
| pedestrians | 11 | 126682 | 30570 |
| life | 8 | 121248 | 109568 |
| ambient | 7 | 49808 | 19384 |
| roads | 3 | 41004 | 0 |
| water | 1 | 40864 | 0 |
| sky | 3 | 28668 | 0 |
| groundcover | 4 | 1032 | 0 |
| camera | 1 | 12 | 0 |

## Top meshes

| tris | inst | vis | cast | module/path | material | degen | sliver | flip | dup | back | buried | bottom |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 341678 | 1 | n |  | landmarks/landmarks/landmarks-detail-0_0 | MeshLambertMaterial | 0 | 0 | 0 | 670 | 2995 | 0 | 2262 |
| 197528 | 1 | y | y | landmarks/landmarks/landmarks-static-0_0 | MeshLambertMaterial | 256 | 24 | 0 | 1 | 36937 | 0 | 84 |
| 122612 | 4 | y | y | boats/boats/boats/boats-big | boats | 1148 | 48 | 0 | 22 | 4 | 0 | 0 |
| 110634 | 1 | y |  | landscape/landscape/land-ground | MeshStandardMaterial | 0 | 1 | 0 | 0 | 0 | 19052 | 0 |
| 101356 | 1 | y | y | buildings/buildings/buildings-trim | buildings-trim | 84 | 622 | 0 | 240 | 1553 | 36 | 60 |
| 98873 | 1 | n |  | vegetation/vegetation/veg-plants-fine-e | veg-plants | 0 | 216 | 1632 | 4 | 937 | 0 | 298 |
| 97970 | 1 | n |  | props/props/props-furniture-fine-e | props-furniture | 968 | 16 | 0 | 130 | 35 | 120 | 1130 |
| 97296 | 1 | y | y | buildings/buildings/buildings-trim | buildings-trim | 96 | 462 | 0 | 0 | 3430 | 0 | 76 |
| 96216 | 48108 | y | y | vegetation/vegetation/veg-cards | veg-cards | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| 95760 | 1596 | y |  | landmarks/landmarks/landmarks-crowd | MeshLambertMaterial | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 94656 | 696 | y |  | pedestrians/pedestrians/peds-pin | MeshLambertMaterial | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 85673 | 1 | y |  | terrain/terrain/terrain-ground | MeshStandardMaterial | 0 | 4 | 1 | 0 | 0 | 365 | 0 |
| 77463 | 1 | n |  | props/props/props-furniture-fine-e | props-furniture | 108 | 0 | 0 | 22 | 47 | 0 | 648 |
| 75712 | 28 | n | y | landscape/landscape/land-farmlife/land-sheep-near | MeshStandardMaterial | 0 | 0 | 0 | 0 | 0 | 0 | 32 |
| 74055 | 1 | y | y | harbor/harbor-north | harbor-solid | 112 | 28 | 174 | 0 | 45 | 1025 | 291 |
| 66490 | 1 | n |  | props/props/props-furniture-fine-e | props-furniture | 1190 | 0 | 0 | 0 | 0 | 0 | 6 |
| 65664 | 5472 | y | y | vegetation/vegetation/veg-wood-far | veg-wood | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 62530 | 31265 | y |  | landscape/landscape/land-trees/land-trees-far | MeshStandardMaterial | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 57606 | 1 | y |  | props/props/props-furniture-e | props-furniture | 8 | 90 | 0 | 0 | 0 | 0 | 0 |
| 54233 | 1 | y | y | buildings/buildings/buildings-trim | buildings-trim | 0 | 516 | 0 | 16 | 241 | 0 | 16 |
| 53655 | 1 | y | y | terrain/terrain/terrain-masonry | MeshStandardMaterial | 0 | 28 | 0 | 0 | 0 | 5979 | 942 |
| 52589 | 1 | n |  | props/props/props-furniture-fine-e | props-furniture | 368 | 60 | 0 | 0 | 0 | 0 | 544 |
| 51574 | 1 | y |  | landscape/landscape/land-reflect | MeshStandardMaterial | 0 | 1 | 0 | 0 | 0 | 4653 | 0 |
| 46310 | 1 | y | y | harbor/harbor-beach | harbor-solid | 12 | 90 | 0 | 20 | 3411 | 219 | 256 |
| 45920 | 574 | y | y | life/life-cloth/life-cloth | life-cloth | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 45855 | 9 | y | y | boats/boats/boats/boats-small | boats | 11 | 12 | 0 | 2 | 8 | 0 | 0 |
| 45184 | 1412 | y | y | life/life-cloth/life-cloth | life-cloth | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 44381 | 1 | n |  | props/props/props-furniture-fine-e | props-furniture | 398 | 0 | 0 | 2 | 2 | 0 | 62 |
| 43968 | 1 | y | y | traffic/traffic-signals/traffic-signal-poles | MeshStandardMaterial | 0 | 0 | 0 | 6 | 0 | 24 | 608 |
| 43216 | 1 | y | y | landmarks/landmarks/landmarks-static--1_0 | MeshLambertMaterial | 732 | 28 | 44 | 0 | 242 | 0 | 454 |
| 40864 | 1 | y |  | water/water/water-surface | MeshStandardMaterial | 0 | 0 | 0 | 0 | 0 | 831 | 0 |
| 40424 | 1 | y | y | harbor/harbor-rides | harbor-rigged | 74 | 1152 | 0 | 0 | 45 | 0 | 0 |
| 39528 | 732 | y |  | landscape/landscape/land-farmlife/land-herds | MeshStandardMaterial | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 39044 | 43 | y | y | traffic/traffic/traffic-sedan-lod2 | traffic-vehicle | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 38904 | 1 | y |  | vegetation/vegetation/veg-plants-e | veg-plants | 0 | 0 | 0 | 0 | 0 | 0 | 120 |
| 36266 | 1 | y |  | terrain/terrain/terrain-railings | MeshStandardMaterial | 0 | 344 | 0 | 0 | 94 | 0 | 0 |
| 35600 | 1 | y |  | landscape/landscape/land-island | MeshStandardMaterial | 0 | 0 | 0 | 0 | 0 | 383 | 0 |
| 35524 | 1 | y |  | roads/roads/roads-hardscape | MeshStandardMaterial | 0 | 606 | 8 | 0 | 2 | 8 | 8 |
| 34683 | 3 | y | y | rail/rail/rail-trains/rail-emu | rail-train | 0 | 16 | 0 | 112 | 46 | 0 | 0 |
| 33120 | 12 | n | y | landscape/landscape/land-farmlife/land-cows-near | MeshStandardMaterial | 0 | 0 | 0 | 0 | 0 | 0 | 64 |
| 32803 | 1 | n |  | props/props/props-furniture-fine-e | props-furniture | 112 | 36 | 0 | 0 | 0 | 0 | 162 |
| 31614 | 1 | y | y | landscape/landscape/land-farmlife/land-tractor/land-tractor-body | MeshStandardMaterial | 1156 | 96 | 0 | 1918 | 553 | 0 | 0 |
| 31464 | 1 | y |  | rail/rail/rail-bed | rail-static | 0 | 0 | 0 | 0 | 0 | 3513 | 0 |
| 31067 | 1 | y | y | harbor/harbor-animated | harbor-rigged | 6 | 112 | 72 | 1127 | 141 | 0 | 0 |
| 29944 | 1 | y | y | landmarks/landmarks/landmarks-kinetic | MeshLambertMaterial | 36 | 16 | 0 | 0 | 1639 | 0 | 0 |
| 29409 | 1 | n |  | props/props/props-furniture-fine-e | props-furniture | 0 | 20 | 0 | 1 | 7 | 0 | 114 |
| 28728 | 42 | y | y | traffic/traffic/traffic-hatch-lod2 | traffic-vehicle | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 26460 | 147 | n |  | sky/clouds | CottonClouds | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 26460 | 45 | y | y | traffic/traffic/traffic-bike-lod2 | traffic-vehicle | 0 | 0 | 0 | 28 | 11 | 0 | 0 |
| 26276 | 1 | y | y | buildings/buildings/buildings-trim | buildings-trim | 24 | 508 | 0 | 226 | 90 | 0 | 14 |
| 25184 | 1 | y | y | buildings/buildings/buildings-trim | buildings-trim | 0 | 508 | 0 | 0 | 10 | 0 | 24 |
| 22656 | 24 | y | y | pedestrians/pedestrians/Mesh | MeshLambertMaterial | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 20670 | 195 | y |  | ambient/ambient/ambient-birds | MeshLambertMaterial | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 20048 | 28 | y | y | traffic/traffic/traffic-suv-lod2 | traffic-vehicle | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 19676 | 1 | n |  | landmarks/landmarks/landmarks-detail-church-66 | MeshLambertMaterial | 0 | 18 | 4 | 0 | 4 | 0 | 220 |
| 19384 | 4 | y | y | ambient/ambient/ambient-vehicles | MeshStandardMaterial | 70 | 40 | 612 | 11 | 17 | 0 | 0 |
| 18299 | 1 | y | y | props/props/props-casters | props-furniture | 0 | 0 | 528 | 0 | 0 | 0 | 138 |
| 17516 | 29 | y | y | traffic/traffic/traffic-compact-lod2 | traffic-vehicle | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 17188 | 1 | n |  | props/props/props-furniture-fine-e | props-furniture | 112 | 0 | 0 | 3 | 7 | 0 | 96 |
| 17120 | 1 | n | y | life/life-night-market | life-night-market | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 15496 | 1 | y | y | rail/rail/rail-furniture | rail-static | 184 | 1128 | 0 | 0 | 0 | 0 | 4 |
| 14622 | 1 | y | y | harbor/harbor-river | harbor-solid | 6 | 0 | 0 | 0 | 6 | 48 | 20 |
| 14112 | 1 | y |  | landscape/landscape/land-mountains/land-mountains | MeshStandardMaterial | 0 | 0 | 0 | 0 | 0 | 247 | 0 |
| 14112 | 1 | y |  | landscape/landscape/land-mountains/land-mountains | MeshStandardMaterial | 0 | 0 | 0 | 0 | 0 | 5 | 0 |
| 14098 | 1 | y |  | landscape/landscape/land-mountains/land-mountains | MeshStandardMaterial | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 13392 | 31 | y | y | traffic/traffic/traffic-moto-lod2 | traffic-vehicle | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 13305 | 1 | n |  | props/props/props-furniture-fine-e | props-furniture | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 13300 | 1 | n |  | landmarks/landmarks/landmarks-detail-townhall-34 | MeshLambertMaterial | 0 | 32 | 24 | 0 | 22 | 0 | 90 |
| 12946 | 1 | y | y | buildings/buildings/buildings-green | buildings-green | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| 12654 | 342 | y | y | landscape/landscape/land-settlements/land-buildings | MeshStandardMaterial | 0 | 0 | 0 | 3 | 9 | 0 | 0 |

## Defects by mesh

| module/path | tris | degen | sliver | flip | dup | back | buried | bottom |
|---|---|---|---|---|---|---|---|---|
| landmarks/landmarks/landmarks-static-0_0 | 197528 | 256 | 24 | 0 | 1 | 36937 | 0 | 84 |
| landscape/landscape/land-ground | 110634 | 0 | 1 | 0 | 0 | 0 | 19052 | 0 |
| terrain/terrain/terrain-masonry | 53655 | 0 | 28 | 0 | 0 | 0 | 5979 | 942 |
| landmarks/landmarks/landmarks-detail-0_0 | 341678 | 0 | 0 | 0 | 670 | 2995 | 0 | 2262 |
| rail/rail/rail-fixings | 5460 | 0 | 0 | 0 | 0 | 0 | 5460 | 0 |
| landscape/landscape/land-reflect | 51574 | 0 | 1 | 0 | 0 | 0 | 4653 | 0 |
| harbor/harbor-beach | 46310 | 12 | 90 | 0 | 20 | 3411 | 219 | 256 |
| rail/rail/rail-fixings | 9620 | 0 | 0 | 0 | 0 | 0 | 3688 | 0 |
| rail/rail/rail-bed | 31464 | 0 | 0 | 0 | 0 | 0 | 3513 | 0 |
| buildings/buildings/buildings-trim | 97296 | 96 | 462 | 0 | 0 | 3430 | 0 | 76 |
| rail/rail/rail-fixings | 9620 | 0 | 0 | 0 | 0 | 0 | 3116 | 0 |
| vegetation/vegetation/veg-plants-fine-e | 98873 | 0 | 216 | 1632 | 4 | 937 | 0 | 298 |
| rail/rail/rail-fixings | 2860 | 0 | 0 | 0 | 0 | 0 | 2860 | 0 |
| landscape/landscape/land-farmlife/land-tractor/land-tractor-body | 31614 | 1156 | 96 | 0 | 1918 | 553 | 0 | 0 |
| buildings/buildings/buildings-trim | 101356 | 84 | 622 | 0 | 240 | 1553 | 36 | 60 |
| landmarks/landmarks/landmarks-kinetic | 29944 | 36 | 16 | 0 | 0 | 1639 | 0 | 0 |
| harbor/harbor-north | 74055 | 112 | 28 | 174 | 0 | 45 | 1025 | 291 |
| props/props/props-furniture-fine-e | 97970 | 968 | 16 | 0 | 130 | 35 | 120 | 1130 |
| harbor/harbor-animated | 31067 | 6 | 112 | 72 | 1127 | 141 | 0 | 0 |
| sky/sky-dome | 2208 | 0 | 0 | 0 | 26 | 86 | 1008 | 0 |
| pedestrians/pedestrians/peds-close | 0 | 172 | 0 | 10 | 744 | 61 | 0 | 88 |
| water/water/water-surface | 40864 | 0 | 0 | 0 | 0 | 0 | 831 | 0 |
| landmarks/landmarks/landmarks-static--1_0 | 43216 | 732 | 28 | 44 | 0 | 242 | 0 | 454 |
| landscape/landscape/land-roads/land-road-ribbons | 3644 | 0 | 0 | 0 | 0 | 0 | 724 | 0 |
| props/props/props-furniture-fine-e | 77463 | 108 | 0 | 0 | 22 | 47 | 0 | 648 |
| props/props/props-near-detail | 9896 | 72 | 0 | 0 | 0 | 0 | 0 | 700 |
| props/props/props-casters | 18299 | 0 | 0 | 528 | 0 | 0 | 0 | 138 |
| landmarks/landmarks/landmarks-static-construction-20 | 11960 | 34 | 1504 | 38 | 0 | 22 | 0 | 600 |
| ambient/ambient/ambient-vehicles | 19384 | 70 | 40 | 612 | 11 | 17 | 0 | 0 |
| traffic/traffic-signals/traffic-signal-poles | 43968 | 0 | 0 | 0 | 6 | 0 | 24 | 608 |
| landscape/landscape/land-settlements/land-farmstead | 9572 | 0 | 28 | 0 | 8 | 527 | 96 | 0 |
| landscape/landscape/land-settlements/land-farmstead | 7644 | 0 | 8 | 0 | 0 | 541 | 20 | 64 |
| props/props/props-furniture-fine-e | 52589 | 368 | 60 | 0 | 0 | 0 | 0 | 544 |
| rail/rail/rail-trains/rail-loco | 0 | 4 | 0 | 256 | 37 | 178 | 0 | 0 |
| landscape/landscape/land-settlements/land-farmstead | 7758 | 0 | 28 | 0 | 0 | 203 | 248 | 8 |
| terrain/terrain/terrain-tunnel-veils | 420 | 0 | 0 | 0 | 0 | 0 | 420 | 0 |
| landscape/landscape/land-island | 35600 | 0 | 0 | 0 | 0 | 0 | 383 | 0 |
| terrain/terrain/terrain-ground | 85673 | 0 | 4 | 1 | 0 | 0 | 365 | 0 |
| landmarks/landmarks/landmarks-static-stadium-26 | 5614 | 0 | 46 | 0 | 0 | 0 | 0 | 354 |
| buildings/buildings/buildings-trim | 26276 | 24 | 508 | 0 | 226 | 90 | 0 | 14 |
| landmarks/landmarks/landmarks-detail-construction-20 | 6484 | 0 | 0 | 0 | 12 | 0 | 0 | 294 |
| rail/rail/rail-trains/rail-wagon | 0 | 0 | 0 | 0 | 118 | 168 | 0 | 0 |
| buildings/buildings/buildings-trim | 54233 | 0 | 516 | 0 | 16 | 241 | 0 | 16 |
| landscape/landscape/land-mountains/land-mountains | 14112 | 0 | 0 | 0 | 0 | 0 | 247 | 0 |
| landmarks/landmarks/landmarks-detail-church-66 | 19676 | 0 | 18 | 4 | 0 | 4 | 0 | 220 |
| landmarks/landmarks/landmarks-detail-station-91 | 10080 | 0 | 36 | 0 | 0 | 0 | 0 | 194 |
| landmarks/landmarks/landmarks-detail--1_0 | 8322 | 0 | 0 | 27 | 0 | 22 | 0 | 122 |
| pedestrians/pedestrians/tableware | 0 | 0 | 0 | 0 | 12 | 12 | 0 | 140 |
| props/props/props-furniture-fine-e | 32803 | 112 | 36 | 0 | 0 | 0 | 0 | 162 |
| rail/rail/rail-trains/rail-emu | 34683 | 0 | 16 | 0 | 112 | 46 | 0 | 0 |
| traffic/traffic/traffic-moto-lod0 | 0 | 0 | 0 | 0 | 21 | 134 | 0 | 0 |
| landmarks/landmarks/landmarks-static--1_-1 | 6468 | 84 | 36 | 0 | 0 | 0 | 0 | 150 |
| landmarks/landmarks/landmarks-detail-townhall-34 | 13300 | 0 | 32 | 24 | 0 | 22 | 0 | 90 |
| props/props/props-furniture-fine-e | 29409 | 0 | 20 | 0 | 1 | 7 | 0 | 114 |
| vegetation/vegetation/veg-plants-e | 38904 | 0 | 0 | 0 | 0 | 0 | 0 | 120 |
| props/props/props-furniture-fine-e | 1488 | 0 | 0 | 0 | 0 | 0 | 116 | 4 |
| props/props/props-furniture-fine-e | 17188 | 112 | 0 | 0 | 3 | 7 | 0 | 96 |
| props/props/props-near-detail | 2188 | 0 | 0 | 0 | 16 | 0 | 0 | 90 |
| landmarks/landmarks/landmarks-static-tvtower-27 | 4830 | 0 | 0 | 0 | 0 | 62 | 0 | 40 |
| landmarks/landmarks/landmarks-static-0_-2 | 512 | 0 | 0 | 0 | 0 | 0 | 93 | 4 |
| props/props/props-near-detail | 7480 | 264 | 0 | 0 | 0 | 0 | 0 | 96 |
| terrain/terrain/terrain-railings | 36266 | 0 | 344 | 0 | 0 | 94 | 0 | 0 |
| pedestrians/pedestrians/street-vendors | 4170 | 0 | 0 | 0 | 0 | 0 | 0 | 84 |
| landmarks/landmarks/landmarks-static-church-66 | 5321 | 0 | 68 | 0 | 4 | 0 | 0 | 76 |
| traffic/traffic/traffic-moto-lod1 | 0 | 0 | 0 | 0 | 0 | 80 | 0 | 0 |
| traffic/traffic/traffic-bike-lod0 | 0 | 36 | 0 | 0 | 62 | 17 | 0 | 0 |
| harbor/harbor-river | 14622 | 6 | 0 | 0 | 0 | 6 | 48 | 20 |
| landmarks/landmarks/landmarks-static--1_-2 | 512 | 0 | 0 | 0 | 0 | 0 | 58 | 15 |
| landmarks/landmarks/landmarks-detail-stadium-26 | 6152 | 0 | 12 | 0 | 0 | 0 | 0 | 72 |
| props/props/props-near-detail | 5440 | 192 | 0 | 0 | 0 | 0 | 0 | 72 |
| props/props/props-furniture-fine-e | 44381 | 398 | 0 | 0 | 2 | 2 | 0 | 62 |
| landscape/landscape/land-farmlife/land-cows-near | 33120 | 0 | 0 | 0 | 0 | 0 | 0 | 64 |
| buildings/buildings/buildings-lights | 6324 | 312 | 48 | 0 | 60 | 0 | 0 | 0 |
| landscape/landscape/land-ships | 912 | 0 | 0 | 0 | 0 | 7 | 48 | 0 |
| landmarks/landmarks/landmarks-static-station-91 | 8276 | 32 | 32 | 0 | 0 | 0 | 0 | 50 |
| props/props/props-near-detail | 4760 | 168 | 0 | 0 | 0 | 0 | 0 | 48 |
| props/props/props-near-detail | 4672 | 192 | 0 | 0 | 0 | 0 | 0 | 48 |
| props/props/props-near-detail | 4632 | 192 | 0 | 0 | 0 | 0 | 0 | 48 |
| props/props/props-near-detail | 4760 | 168 | 0 | 0 | 0 | 0 | 0 | 48 |
| harbor/harbor-rides | 40424 | 74 | 1152 | 0 | 0 | 45 | 0 | 0 |

## Floating parts (1034)

| mesh | parts | tris |
|---|---|---|
| harbor | harbor-beach | 358 | 3232 |
| ambient | ambient/ambient-birds | 135 | 14310 |
| props | props/props-furniture-fine-e | 102 | 816 |
| terrain | terrain/terrain-masonry | 101 | 222 |
| harbor | harbor-animated | 66 | 858 |
| vegetation | vegetation/veg-plants-fine-e | 53 | 106 |
| props | props/props-glows | 44 | 88 |
| landscape | landscape/land-ships | 23 | 203 |
| harbor | harbor-north | 22 | 424 |
| buildings | buildings/buildings-trim | 19 | 285 |
| buildings | buildings/buildings-lights | 18 | 396 |
| buildings | buildings/buildings-signs | 10 | 20 |
| landmarks | landmarks/landmarks-glows | 10 | 20 |
| landmarks | landmarks/landmarks-lights | 9 | 132 |
| landmarks | landmarks/landmarks-static-construction-20 | 8 | 96 |
| landmarks | landmarks/landmarks-static--1_-1 | 7 | 420 |
| landmarks | landmarks/landmarks-detail--1_-1 | 7 | 84 |
| harbor | harbor-glows | 7 | 14 |
| landmarks | landmarks/landmarks-detail-construction-20 | 6 | 72 |
| rail | rail/rail-furniture | 5 | 152 |
| roads | roads/roads-markings | 5 | 10 |
| landscape | landscape/land-settlements/land-buildings | 4 | 148 |
| props | props/props-furniture-e | 4 | 48 |
| ambient | ambient/ambient-vehicles | 3 | 14538 |
| props | props/props-casters | 3 | 36 |
| ambient | ambient/ambient-waterfowl | 2 | 532 |
| landmarks | landmarks/landmarks-ball | 1 | 140 |
| landscape | landscape/land-farmlife/land-tractor/land-tractor-body | 1 | 32 |
| water | water/water-surface | 1 | 22 |

## Sunk parts (1730)

| mesh | parts | tris |
|---|---|---|
| rail | rail/rail-fixings | 1512 | 15120 |
| rail | rail/rail-bed | 56 | 560 |
| terrain | terrain/terrain-masonry | 40 | 612 |
| terrain | terrain/terrain-glows | 34 | 68 |
| terrain | terrain/terrain-tunnel-veils | 20 | 420 |
| harbor | harbor-north | 19 | 771 |
| water | water/water-surface | 8 | 76 |
| harbor | harbor-beach | 8 | 112 |
| landscape | landscape/land-roads/land-road-ribbons | 7 | 90 |
| landscape | landscape/land-settlements/land-farmstead | 7 | 84 |
| landscape | landscape/land-settlements/land-buildings | 5 | 185 |
| landscape | landscape/land-ships | 4 | 48 |
| props | props/props-furniture-fine-e | 3 | 54 |
| buildings | buildings/buildings-trim | 3 | 36 |
| traffic | traffic/traffic-bike-lod2 | 2 | 1176 |
| pedestrians | pedestrians/Mesh | 2 | 4 |

## Inside a building (97)

| mesh | parts | tris |
|---|---|---|
| props | props/props-near-detail | 53 | 2002 |
| props | props/props-furniture-fine-e | 38 | 1080 |
| pedestrians | pedestrians/Mesh | 3 | 6 |
| harbor | harbor-north | 2 | 4 |
| props | props/props-contact | 1 | 2 |

## Visibility census — 147 sample points × 6 faces, 512² (882 views, 13747 ms)

`hidden` = never rasterised and area > 0.02 m²; `tiny` = never rasterised, smaller (too small or hidden).

| tris | seen | hidden | down | up | side | tiny | hidden m² | module/path |
|---|---|---|---|---|---|---|---|---|
| 341678 | 1185 | 2982 | 608 | 586 | 1788 | 337511 | 152 | landmarks/landmarks/landmarks-detail-0_0 |
| 197528 | 2693 | 580 | 214 | 137 | 229 | 194255 | 189 | landmarks/landmarks/landmarks-static-0_0 |
| 110634 | 95910 | 14721 | 0 | 14483 | 238 | 3 | 6323004775 | landscape/landscape/land-ground |
| 101356 | 45234 | 18527 | 2728 | 2627 | 13172 | 37595 | 2647 | buildings/buildings/buildings-trim |
| 98873 | 34872 | 1972 | 336 | 415 | 1221 | 62029 | 67 | vegetation/vegetation/veg-plants-fine-e |
| 97970 | 16040 | 4597 | 810 | 723 | 3064 | 77333 | 286 | props/props/props-furniture-fine-e |
| 97296 | 49494 | 10163 | 3221 | 1801 | 5141 | 37639 | 1112 | buildings/buildings/buildings-trim |
| 85673 | 61679 | 23604 | 0 | 17663 | 5941 | 390 | 49365 | terrain/terrain/terrain-ground |
| 77463 | 9767 | 118 | 12 | 26 | 80 | 67578 | 16 | props/props/props-furniture-fine-e |
| 74055 | 13080 | 33343 | 6637 | 4272 | 22434 | 27632 | 5972 | harbor/harbor-north |
| 66490 | 10013 | 2459 | 245 | 1364 | 850 | 54018 | 200 | props/props/props-furniture-fine-e |
| 57606 | 25757 | 3457 | 239 | 186 | 3032 | 28392 | 271 | props/props/props-furniture-e |
| 54233 | 20223 | 9401 | 1264 | 1151 | 6986 | 24609 | 1047 | buildings/buildings/buildings-trim |
| 53655 | 26525 | 18606 | 6760 | 2511 | 9335 | 8524 | 5024 | terrain/terrain/terrain-masonry |
| 52589 | 13397 | 3187 | 979 | 486 | 1722 | 36005 | 277 | props/props/props-furniture-fine-e |
| 51574 | 0 | 51570 | 0 | 49761 | 1809 | 4 | 275819928 | landscape/landscape/land-reflect |
| 46310 | 17452 | 3493 | 1194 | 231 | 2068 | 25365 | 1748 | harbor/harbor-beach |
| 44381 | 6861 | 2947 | 278 | 1463 | 1206 | 34573 | 269 | props/props/props-furniture-fine-e |
| 43968 | 16988 | 939 | 261 | 55 | 623 | 26041 | 70 | traffic/traffic-signals/traffic-signal-poles |
| 43216 | 10242 | 1764 | 813 | 256 | 695 | 31210 | 385 | landmarks/landmarks/landmarks-static--1_0 |
| 40424 | 15971 | 1479 | 378 | 348 | 753 | 22974 | 119 | harbor/harbor-rides |
| 38904 | 23637 | 11725 | 5800 | 49 | 5876 | 3542 | 916 | vegetation/vegetation/veg-plants-e |
| 36266 | 13158 | 480 | 149 | 85 | 246 | 22628 | 48 | terrain/terrain/terrain-railings |
| 35600 | 12890 | 22710 | 0 | 20913 | 1797 | 0 | 2678810 | landscape/landscape/land-island |
| 35524 | 29598 | 1942 | 8 | 78 | 1856 | 3984 | 782 | roads/roads/roads-hardscape |
| 32803 | 7825 | 3318 | 662 | 954 | 1702 | 21660 | 303 | props/props/props-furniture-fine-e |
| 31614 | 268 | 525 | 107 | 134 | 284 | 30821 | 35 | landscape/landscape/land-farmlife/land-tractor/land-tractor-body |
| 31464 | 18164 | 10713 | 0 | 7828 | 2885 | 2587 | 850 | rail/rail/rail-bed |
| 31067 | 13148 | 7877 | 771 | 627 | 6479 | 10042 | 3102 | harbor/harbor-animated |
| 29944 | 4549 | 742 | 166 | 125 | 451 | 24653 | 303 | landmarks/landmarks/landmarks-kinetic |
| 29409 | 7087 | 444 | 222 | 15 | 207 | 21878 | 30 | props/props/props-furniture-fine-e |
| 26276 | 12704 | 6429 | 580 | 951 | 4898 | 7143 | 2315 | buildings/buildings/buildings-trim |
| 25184 | 10795 | 2712 | 630 | 477 | 1605 | 11677 | 388 | buildings/buildings/buildings-trim |
| 19676 | 3766 | 2477 | 289 | 289 | 1899 | 13433 | 1511 | landmarks/landmarks/landmarks-detail-church-66 |
| 18299 | 7069 | 4777 | 897 | 210 | 3670 | 6453 | 1002 | props/props/props-casters |
| 17188 | 2014 | 135 | 16 | 48 | 71 | 15039 | 21 | props/props/props-furniture-fine-e |
| 17120 | 8601 | 6940 | 0 | 102 | 6838 | 1579 | 190 | life/life-night-market |
| 15496 | 4329 | 3174 | 450 | 175 | 2549 | 7993 | 517 | rail/rail/rail-furniture |
| 14622 | 10073 | 1283 | 508 | 184 | 591 | 3266 | 168 | harbor/harbor-river |
| 14112 | 2477 | 11635 | 0 | 11631 | 4 | 0 | 182702684 | landscape/landscape/land-mountains/land-mountains |
| 14112 | 1364 | 12748 | 0 | 12660 | 88 | 0 | 194552005 | landscape/landscape/land-mountains/land-mountains |
| 14098 | 1939 | 12159 | 0 | 12159 | 0 | 0 | 183087019 | landscape/landscape/land-mountains/land-mountains |
| 13305 | 1941 | 1436 | 25 | 977 | 434 | 9928 | 102 | props/props/props-furniture-fine-e |
| 13300 | 5326 | 3809 | 494 | 347 | 2968 | 4165 | 3276 | landmarks/landmarks/landmarks-detail-townhall-34 |
| 12946 | 11065 | 1881 | 0 | 0 | 1881 | 0 | 367 | buildings/buildings/buildings-green |
| 12334 | 3026 | 3899 | 0 | 173 | 3726 | 5409 | 1555 | harbor/harbor-yards |
| 11960 | 4460 | 3840 | 1473 | 726 | 1641 | 3660 | 2391 | landmarks/landmarks/landmarks-static-construction-20 |
| 11340 | 991 | 10349 | 0 | 10349 | 0 | 0 | 142640325 | landscape/landscape/land-mountains/land-mountains |
| 11298 | 622 | 10676 | 0 | 10613 | 63 | 0 | 151867721 | landscape/landscape/land-mountains/land-mountains |
| 10080 | 3019 | 3495 | 611 | 501 | 2383 | 3566 | 598 | landmarks/landmarks/landmarks-detail-station-91 |
| 9896 | 659 | 17 | 4 | 1 | 12 | 9220 | 0 | props/props/props-near-detail |
| 9620 | 148 | 108 | 0 | 108 | 0 | 9364 | 4 | rail/rail/rail-fixings |
| 9620 | 263 | 72 | 0 | 72 | 0 | 9285 | 3 | rail/rail/rail-fixings |
| 9620 | 239 | 64 | 0 | 64 | 0 | 9317 | 2 | rail/rail/rail-fixings |
| 9620 | 469 | 42 | 0 | 42 | 0 | 9109 | 2 | rail/rail/rail-fixings |
| 9620 | 379 | 53 | 0 | 53 | 0 | 9188 | 2 | rail/rail/rail-fixings |
| 9620 | 479 | 55 | 0 | 55 | 0 | 9086 | 2 | rail/rail/rail-fixings |
| 9620 | 127 | 105 | 0 | 105 | 0 | 9388 | 4 | rail/rail/rail-fixings |
| 9620 | 91 | 117 | 0 | 117 | 0 | 9412 | 4 | rail/rail/rail-fixings |
| 9620 | 261 | 56 | 0 | 56 | 0 | 9303 | 2 | rail/rail/rail-fixings |
| 9620 | 123 | 95 | 0 | 95 | 0 | 9402 | 3 | rail/rail/rail-fixings |
| 9620 | 58 | 127 | 0 | 127 | 0 | 9435 | 5 | rail/rail/rail-fixings |
| 9572 | 1352 | 3994 | 846 | 739 | 2409 | 4226 | 2705 | landscape/landscape/land-settlements/land-farmstead |
| 9296 | 1069 | 8227 | 0 | 8211 | 16 | 0 | 852310395 | landscape/landscape/land-reflect-mtn |
| 8322 | 2239 | 53 | 30 | 23 | 0 | 6030 | 1 | landmarks/landmarks/landmarks-detail--1_0 |
| 8276 | 3783 | 2332 | 627 | 208 | 1497 | 2161 | 3169 | landmarks/landmarks/landmarks-static-station-91 |
| 8138 | 5069 | 1590 | 300 | 153 | 1137 | 1479 | 3315 | landmarks/landmarks/landmarks-static-townhall-34 |
| 8040 | 1423 | 18 | 0 | 0 | 18 | 6599 | 0 | props/props/props-near-detail |
| 7758 | 1432 | 3137 | 565 | 373 | 2199 | 3189 | 3144 | landscape/landscape/land-settlements/land-farmstead |
| 7644 | 503 | 4391 | 965 | 936 | 2490 | 2750 | 2622 | landscape/landscape/land-settlements/land-farmstead |

Totals: 2931462 tris, 420236 hidden, 1680503 tiny.
