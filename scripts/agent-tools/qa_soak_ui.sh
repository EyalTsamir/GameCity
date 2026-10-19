#!/bin/bash
# Lead Phase-3: soak (4 min at 4x, full city) then ui-test (full city, all steps). Resumable:
# a step whose JSON exists is skipped. Out: shots/lead/qa/{soak,uitest}.json, log shots/lead/qa/soak_ui.log
cd /home/user/GameCity || exit 1
LOG=shots/lead/qa/soak_ui.log
if [ ! -s shots/lead/qa/soak.json ]; then
  echo "$(date -u +%T) soak start" >>"$LOG"
  TH_LOCK_SLOTS=2 timeout 2400 node scripts/soak.mjs --minutes 4 --speed 4 --q "nointro&noidle&adaptive=0&quality=high" > shots/lead/qa/soak.json 2>>"$LOG"
  echo "$(date -u +%T) soak end exit=$?" >>"$LOG"
fi
if [ ! -s shots/lead/qa/uitest.json ]; then
  echo "$(date -u +%T) ui-test start" >>"$LOG"
  TH_LOCK_SLOTS=2 timeout 2700 node scripts/ui-test.mjs --q noidle --out shots/lead/qa/uitest > shots/lead/qa/uitest.json 2>>"$LOG"
  echo "$(date -u +%T) ui-test end exit=$?" >>"$LOG"
fi
echo "$(date -u +%T) ALL DONE" >>"$LOG"
