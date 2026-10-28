#!/bin/bash
# Golden-view regression check: capture fixed views in one session and diff them against a reference set.
#   scripts/agent-tools/golden.sh ref            # (re)capture the reference into shots/golden/ref
#   scripts/agent-tools/golden.sh <tag>          # capture shots/golden/<tag>, diff vs ref → shots/golden/<tag>/diff.png + scores
# Views: overview, downtown, oldtown, harbor, westbrook @ 11 h, 1280×720, ?seed default, sim paused after load.
# Mean abs diff per view (0–255) is printed; moving traffic/people make ~2–4 normal, > 8 means look at diff.png.
set -e
cd "$(dirname "$0")/../.."
TAG=${1:-cur}
OUT=shots/golden/$TAG
mkdir -p "$OUT"
node scripts/capture-set.mjs --out "$OUT" --views overview,downtown,oldtown,harbor,westbrook --hours 11 \
  --width 1280 --height 720 --hideui 1 --q "nointro&noidle&speed=0" > "$OUT.log" 2>&1 || true
grep -E '"consoleErrors"|harnessError' -A2 "$OUT.log" | head -6
[ "$TAG" = ref ] && exit 0
python3 -I - "$OUT" <<'P'
import sys, glob, os
from PIL import Image, ImageChops, ImageStat
out = sys.argv[1]; specs = []
for f in sorted(glob.glob(out + '/*.png')):
    if f.endswith('diff.png'): continue
    r = 'shots/golden/ref/' + os.path.basename(f)
    if not os.path.exists(r): continue
    a, b = Image.open(r).convert('RGB'), Image.open(f).convert('RGB')
    d = ImageChops.difference(a, b)
    m = sum(ImageStat.Stat(d).mean) / 3
    print(f'{os.path.basename(f)}: mean diff {m:.1f}')
    d.point(lambda v: min(255, v * 4)).save(f[:-4] + '_d.png')
    specs += [f'ref {os.path.basename(f)}|{r}', f'now|{f}', f'diff x4 ({m:.1f})|{f[:-4]}_d.png']
os.system('python3 -I scripts/agent-tools/sheet.py %s/diff.png 3 520 %s' % (out, ' '.join("'%s'" % s for s in specs)))
print('sheet', out + '/diff.png')
P
