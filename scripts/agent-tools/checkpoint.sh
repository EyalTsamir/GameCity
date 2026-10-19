#!/bin/bash
# Lead checkpoint while agents keep editing the main tree:
#   snapshot every changed/new file into the check worktree, typecheck there, drop files that fail
#   (iterating, so dependants of a dropped file are dropped too), commit the consistent snapshot in
#   the check worktree, move the branch ref to it and reset the main index (working files untouched).
#   usage: shots/tools/checkpoint.sh "commit subject"   [--push]
set -u
# one checkpoint at a time (the lead, the stop hook and autocheckpoint.sh may overlap)
exec 9>/home/user/GameCity/.git/th-checkpoint.lock
flock -w 900 9 || { echo "checkpoint: another checkpoint still running"; exit 5; }
MAIN=/home/user/GameCity
CHECK=/home/user/GameCity-check
BRANCH=$(git -C "$MAIN" rev-parse --abbrev-ref HEAD)
SUBJECT=${1:-"Checkpoint"}
PUSH=${2:-}
TRAILER=$'\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_017phrqi4GgwkWn4PGQaZz7v'

if [ ! -d "$CHECK" ]; then
  git -C "$MAIN" worktree add --detach "$CHECK" HEAD >/dev/null 2>&1 || exit 1
  ln -s "$MAIN/node_modules" "$CHECK/node_modules"
fi
OLD=$(git -C "$MAIN" rev-parse HEAD)
git -C "$CHECK" checkout -q --detach "$OLD" && git -C "$CHECK" reset -q --hard "$OLD" && git -C "$CHECK" clean -qfd -e node_modules

cd "$MAIN" || exit 1
CHANGED=$( { git diff --name-only --diff-filter=AMR HEAD; git ls-files --others --exclude-standard; } | sort -u)
DELETED=$(git diff --name-only --diff-filter=D HEAD)
# one quick pass so the snapshot is as close to a single instant as possible
if [ -z "$CHANGED$DELETED" ]; then echo "nothing to commit (tree matches HEAD)"; exit 0; fi
[ -n "$CHANGED" ] && tar -cf - $CHANGED 2>/dev/null | tar -xf - -C "$CHECK"
for f in $DELETED; do git -C "$CHECK" rm -q --cached "$f" 2>/dev/null; rm -f "$CHECK/$f"; done

# a failing file drops its whole module group (src/<area>/<name>.ts + src/<area>/<name>/**), since
# an agent's half-finished edit usually spans several files of one module
DROPPED=""
for i in 1 2 3 4 5 6 7 8; do
  ERRS=$(cd "$CHECK" && npx tsc --noEmit -p . 2>&1 | grep -oE '^src/[^(]+' | sort -u)
  [ -z "$ERRS" ] && break
  for f in $ERRS; do
    G=$(echo "$f" | sed -E 's#^(src/[a-z]+/[A-Za-z]+)(\.ts|/.*)$#\1#')
    case " $DROPPED " in *" $G "*) continue;; esac
    DROPPED="$DROPPED $G"
    for c in $(echo "$CHANGED" | grep -E "^$G(\.ts|/)"); do
      if git -C "$CHECK" cat-file -e "$OLD:$c" 2>/dev/null; then git -C "$CHECK" checkout -q "$OLD" -- "$c"; else rm -f "$CHECK/$c"; fi
    done
  done
done
if [ -n "$(cd "$CHECK" && npx tsc --noEmit -p . 2>&1 | grep -E 'error TS')" ]; then
  echo "checkpoint ABORTED: snapshot does not typecheck even after dropping:$DROPPED"; exit 2
fi
git -C "$CHECK" add -A -- . ':!node_modules'
if git -C "$CHECK" diff --cached --quiet; then echo "nothing to commit"; exit 0; fi
MSG="$SUBJECT"
[ -n "$DROPPED" ] && MSG="$MSG"$'\n\n'"Held back (mid-edit, did not typecheck):$(echo $DROPPED | tr ' ' '\n' | sort -u | sed 's/^/ /' | tr '\n' ' ')"
git -C "$CHECK" commit -q -m "$MSG$TRAILER" || exit 3
NEW=$(git -C "$CHECK" rev-parse HEAD)
git -C "$MAIN" update-ref "refs/heads/$BRANCH" "$NEW" "$OLD" || exit 4
git -C "$MAIN" reset -q           # index := new HEAD; working files untouched
echo "checkpoint $NEW on $BRANCH (dropped:${DROPPED:- none})"
git -C "$MAIN" log --oneline -1
if [ "$PUSH" = "--push" ]; then
  for d in 2 4 8 16; do git -C "$MAIN" push -q -u origin "$BRANCH" && break; sleep $d; done
fi
