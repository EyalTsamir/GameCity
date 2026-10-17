# Labelled contact sheet / before-after builder. Usage:
#   python3 -I shots/tools/sheet.py OUT.png COLS TILE_W "label|path.png|x0,y0,x1,y1(optional crop)" ...
# Build a labelled contact sheet: sheet.py OUT.png COLS TILE_W "label|path|x0,y0,x1,y1(optional)" ...
import sys
from PIL import Image, ImageDraw, ImageFont
out, cols, tw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
items = []
for spec in sys.argv[4:]:
    parts = spec.split('|')
    im = Image.open(parts[1]).convert('RGB')
    if len(parts) > 2 and parts[2]:
        im = im.crop(tuple(int(v) for v in parts[2].split(',')))
    th = round(im.height * tw / im.width)
    items.append((parts[0], im.resize((tw, th), Image.LANCZOS)))
rows = (len(items) + cols - 1) // cols
rowh = [max(it[1].height for it in items[r * cols:(r + 1) * cols]) for r in range(rows)]
pad, lab = 8, 30
W = cols * tw + (cols + 1) * pad
H = sum(rowh) + rows * (lab + pad) + pad
sheet = Image.new('RGB', (W, H), (24, 24, 28))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
except OSError:
    font = ImageFont.load_default()
y = pad
for r in range(rows):
    for c, (label, im) in enumerate(items[r * cols:(r + 1) * cols]):
        x = pad + c * (tw + pad)
        d.text((x + 2, y + 5), label, fill=(240, 236, 226), font=font)
        sheet.paste(im, (x, y + lab))
    y += lab + rowh[r] + pad
sheet.save(out)
print(out, sheet.size)
