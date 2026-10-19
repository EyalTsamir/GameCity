#!/bin/bash
# Lead Phase-3 perf A/B, round 2: alternating A/B/A/B to expose order effects + split suspects.
#   out: shots/lead/qa/perf/2_<name>.json (resumable), log shots/lead/qa/perf.log
cd /home/user/GameCity || exit 1
LOG=shots/lead/qa/perf.log
Q="nointro&noidle&adaptive=0&quality=high"
ALL="legacylight&notable&legacylamps&nowaterrefl&wakes=puffs&nohullfoam&legacyfacade&legacyhouses&legacyveg&noscatter&nogardens&legacyground&legacyterrain&legacypeople"
RUNS=(
  "downtown|downtown|12|;legacylight;notable;;legacylight&notable;$ALL;"
  "harbor|harbor|21.5|;nowaterrefl;;nowaterrefl;waterrefl=1"
  "overview|overview|12|;notable;legacyveg;;notable;legacyveg"
  "harborday|harbor|12|;nowaterrefl;;nowaterrefl"
)
for r in "${RUNS[@]}"; do
  IFS='|' read -r name view hours vars <<<"$r"
  out=shots/lead/qa/perf/2_${name}.json
  [ -s "$out" ] && continue
  echo "$(date -u +%T) round2 $name start" >>"$LOG"
  TH_LOCK_SLOTS=1 timeout 3000 node scripts/perf.mjs --view "$view" --hours "$hours" --width 1600 --height 900 --seconds 8 --q "$Q" --variants "$vars" > "$out" 2>>"$LOG"
  echo "$(date -u +%T) round2 $name end exit=$?" >>"$LOG"
done
echo "$(date -u +%T) round2 ALL DONE" >>"$LOG"
