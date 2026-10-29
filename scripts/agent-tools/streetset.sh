#!/bin/bash
# Eye-level before/after set (the golden views are all aerial):
#   scripts/agent-tools/streetset.sh <url> <tag> [reftag]
# captures shots/street/<tag>/ (street, market, platform, quay, downtown @ 12 h and 21.5 h, 1600x900, sim paused)
# from the dev server at <url>; with [reftag] diffs every view against shots/street/<reftag>/ → diff sheet.
set -e
cd "$(dirname "$0")/../.."
URL=${1:?url}; TAG=${2:?tag}; REF=$3
OUT=shots/street/$TAG
mkdir -p "$OUT"
node scripts/capture-set.mjs --url "$URL" --out "$OUT" --hours 12,21.5 --width 1600 --height 900 --hideui 1 --q "nointro&noidle&speed=0" \
  --views "street=5,1.5,-65,9,0,6;market=27.5,1,78.5,16,200,28;platform=-10,1.4,-146.3,6,60,8;quay=131,1.2,-131,6,90,12;downtown=0,2,-65,55,35,28" > "$OUT.log" 2>&1 || true
grep -E '"consoleErrors"|harnessError' -A2 "$OUT.log" | head -6
[ -z "$REF" ] && exit 0
python3 -I - "$OUT" "shots/street/$REF" <<'P'
import sys, glob, os
from PIL import Image, ImageChops, ImageStat
out, ref = sys.argv[1], sys.argv[2]; specs = []
for f in sorted(glob.glob(out + '/*.png')):
    if f.endswith('_d.png') or f.endswith('diff.png'): continue
    r = os.path.join(ref, os.path.basename(f))
    if not os.path.exists(r): continue
    a, b = Image.open(r).convert('RGB'), Image.open(f).convert('RGB')
    d = ImageChops.difference(a, b)
    m = sum(ImageStat.Stat(d).mean) / 3
    print(f'{os.path.basename(f)}: mean diff {m:.2f}')
    d.point(lambda v: min(255, v * 4)).save(f[:-4] + '_d.png')
    specs += [f'before {os.path.basename(f)}|{r}', f'after|{f}', f'diff x4 ({m:.2f})|{f[:-4]}_d.png']
os.system('python3 -I scripts/agent-tools/sheet.py %s/diff.png 3 520 %s' % (out, ' '.join("'%s'" % s for s in specs)))
print('sheet', out + '/diff.png')
P
