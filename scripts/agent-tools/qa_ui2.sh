#!/bin/bash
# Lead Phase-3: ui-test cross-check. (1) new build, default stand-in city (camera/ui/audio only);
# (2) ORIGINAL build, full city (same flags as shots/lead/qa/uitest.json) to tell harness slowness from regressions.
cd /home/user/GameCity || exit 1
LOG=shots/lead/qa/soak_ui.log
[ -s shots/lead/qa/uitest_default_new.json ] || { echo "$(date -u +%T) ui default new start" >>"$LOG"; TH_LOCK_SLOTS=2 timeout 2700 node scripts/ui-test.mjs --out shots/lead/qa/uitest_dn > shots/lead/qa/uitest_default_new.json 2>>"$LOG"; echo "$(date -u +%T) ui default new end $?" >>"$LOG"; }
[ -s shots/lead/qa/uitest_full_base.json ] || { echo "$(date -u +%T) ui full base start" >>"$LOG"; TH_LOCK_SLOTS=2 timeout 2700 node scripts/ui-test.mjs --url http://127.0.0.1:5174/ --q noidle --out shots/lead/qa/uitest_fb > shots/lead/qa/uitest_full_base.json 2>>"$LOG"; echo "$(date -u +%T) ui full base end $?" >>"$LOG"; }
echo "$(date -u +%T) UI2 DONE" >>"$LOG"
