#!/bin/bash
# Lead Phase-3 consolidated perf A/B (run on a QUIET machine: no other browser jobs). SwiftShader ⇒ relative only.
#   usage: scripts/agent-tools/qa_perf.sh [rep]     (rep = 1, 2, … ; resumable per view/rep)
#   out:   shots/lead/qa/perf/<rep>_<view>.json, log shots/lead/qa/perf.log
REP=${1:-1}
cd /home/user/GameCity || exit 1
mkdir -p shots/lead/qa/perf
LOG=shots/lead/qa/perf.log
Q="nointro&noidle&adaptive=0&quality=high"
ALL="legacylight&notable&legacylamps&nowaterrefl&wakes=puffs&nohullfoam&legacyfacade&legacyhouses&legacyveg&noscatter&nogardens&legacyground&legacyterrain&legacypeople"
RUNS=(
  "downtown|12|;$ALL;legacyfacade&legacyhouses;noscatter&nogardens&legacyground;legacypeople;legacylight&notable"
  "overview|12|;$ALL;nowaterrefl;legacyveg;vegcells=8;legacyterrain"
  "harbor|21.5|;$ALL;nowaterrefl;waterrefl=1;legacylamps"
  "westbrook|12|;$ALL;legacyveg;noscatter&nogardens;legacyhouses"
)
for r in "${RUNS[@]}"; do
  IFS='|' read -r view hours vars <<<"$r"
  out=shots/lead/qa/perf/${REP}_${view}.json
  [ -s "$out" ] && continue
  echo "$(date -u +%T) rep$REP $view start" >>"$LOG"
  TH_LOCK_SLOTS=1 timeout 3000 node scripts/perf.mjs --view "$view" --hours "$hours" --width 1600 --height 900 --seconds 6 --q "$Q" --variants "$vars" > "$out" 2>>"$LOG"
  echo "$(date -u +%T) rep$REP $view end exit=$?" >>"$LOG"
done
# original build reference (same views, no variants)
if [ "$REP" = 1 ]; then for r in "${RUNS[@]}"; do
  IFS='|' read -r view hours vars <<<"$r"; out=shots/lead/qa/perf/orig_${view}.json; [ -s "$out" ] && continue
  TH_LOCK_SLOTS=1 timeout 1500 node scripts/perf.mjs --url http://127.0.0.1:5174/ --view "$view" --hours "$hours" --width 1600 --height 900 --seconds 6 --q "$Q" > "$out" 2>>"$LOG"
done; fi
echo "$(date -u +%T) rep$REP ALL DONE" >>"$LOG"
