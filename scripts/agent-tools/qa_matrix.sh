#!/bin/bash
# Lead Phase-3 before/after matrix, one side at a time, in <=15-min chunks (FIFO lock, 1 slot each).
#   usage: scripts/agent-tools/qa_matrix.sh base|new        (base = 5174 original code, new = 5173)
#   output: shots/lead/qa/<side>/<chunk>/<view>_<h>.png + report.json; log shots/lead/qa/<side>.log
#   Resumable: a chunk whose report.json exists is skipped.
SIDE=$1
case "$SIDE" in base) URL=http://127.0.0.1:5174/;; new) URL=http://127.0.0.1:5173/;; *) echo "base|new"; exit 1;; esac
cd /home/user/GameCity || exit 1
A="overview,downtown,oldtown,harbor,beach,park"
B="station,riverside,stadium,westbrook,industry"
K="overview,downtown,harbor,beach,oldtown"
CHUNKS=("11a|11|$A" "11b|11|$B" "18a|18.2|$A" "18b|18.2|$B" "21a|21.5|$A" "21b|21.5|$B" "06k|6.5|$K" "02k|2|$K")
LOG=shots/lead/qa/$SIDE.log
for c in "${CHUNKS[@]}"; do
  IFS='|' read -r name hours views <<<"$c"
  out=shots/lead/qa/$SIDE/$name
  [ -f "$out/report.json" ] && { echo "$(date -u +%T) skip $name" >>"$LOG"; continue; }
  echo "$(date -u +%T) start $name ($hours h: $views)" >>"$LOG"
  TH_LOCK_SLOTS=2 timeout 1500 node scripts/capture-set.mjs --url "$URL" --out "$out" --views "$views" --hours "$hours" \
    --hideui 1 --width 1600 --height 900 --q "nointro&noidle&adaptive=0&quality=high" >>"$LOG" 2>&1
  echo "$(date -u +%T) end $name exit=$?" >>"$LOG"
done
echo "$(date -u +%T) ALL DONE" >>"$LOG"
