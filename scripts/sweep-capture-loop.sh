#!/usr/bin/env bash
# The full capture of the city sweep in chunks, so other sessions get turns in the browser between them.
# <out>/chunk-minutes holds the length of the next chunk (default 10), read before each one, so it can change during the run.
# Touching <out>/STOP-CAPTURE stops it after the chunk in hand. Everything resumes: run it again to go on.
cd "$(dirname "$0")/.." || exit 1
OUT=shots/sweep
mkdir -p "$OUT"
while :; do
  if [ -e "$OUT/STOP-CAPTURE" ]; then echo "$(date +%T) stop file" >> "$OUT/capture.log"; exit 0; fi
  if node scripts/sweep.mjs --dry --night-views 3 --out "$OUT" | grep -q '"todo": 0'; then echo "$(date +%T) nothing left" >> "$OUT/capture.log"; exit 0; fi
  M=$(cat "$OUT/chunk-minutes" 2>/dev/null || echo 10)
  node scripts/sweep.mjs --night-views 3 --freeze 1 --max-minutes "$M" --out "$OUT" >> "$OUT/capture.log" 2>&1
  CODE=$?
  echo "$(date +%T) chunk of $M min ended with $CODE" >> "$OUT/capture.log"
  # 2 = disk, 3 = power, 1 = kept failing
  if [ "$CODE" -ne 0 ]; then exit "$CODE"; fi
done
