#!/bin/bash
# Lead safety net: checkpoint + push the shared tree every N minutes (default 15), so a usage-limit
# stop or a reclaimed container loses at most N minutes of agent edits. Single instance; runs detached:
#   setsid nohup shots/tools/autocheckpoint.sh 15 >/dev/null 2>&1 < /dev/null &
#   stop: pkill -f autocheckpoint.sh        log: shots/autocheckpoint.log
N=${1:-15}
exec 8>/home/user/GameCity/.git/th-autocheckpoint.lock
flock -n 8 || { echo "autocheckpoint already running"; exit 0; }
LOG=/home/user/GameCity/shots/autocheckpoint.log
while true; do
  sleep $((N * 60))
  { date -u '+%F %T'; /home/user/GameCity/shots/tools/checkpoint.sh "Auto-checkpoint (WIP safety net)" --push 2>&1 | tail -2; } >>"$LOG"
done
