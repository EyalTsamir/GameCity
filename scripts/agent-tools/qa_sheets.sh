#!/bin/bash
# Build before/after sheets from the QA matrix: one sheet per chunk, rows of BEFORE|AFTER|BEFORE|AFTER.
#   usage: scripts/agent-tools/qa_sheets.sh [chunk ...]     (default: every chunk present on both sides)
#   out:   shots/lead/qa/sheets/<chunk>.png
cd /home/user/GameCity || exit 1
mkdir -p shots/lead/qa/sheets
CH=${@:-$(ls shots/lead/qa/new 2>/dev/null)}
for c in $CH; do
  [ -d "shots/lead/qa/base/$c" ] && [ -d "shots/lead/qa/new/$c" ] || continue
  specs=()
  for f in shots/lead/qa/new/$c/*.png; do
    b=$(basename "$f"); [ -f "shots/lead/qa/base/$c/$b" ] || continue
    n=${b%.png}
    specs+=("BEFORE $n|shots/lead/qa/base/$c/$b" "AFTER $n|$f")
  done
  [ ${#specs[@]} -gt 0 ] && python3 -I shots/tools/sheet.py "shots/lead/qa/sheets/$c.png" 4 760 "${specs[@]}" && echo "sheet $c (${#specs[@]} tiles)"
done
