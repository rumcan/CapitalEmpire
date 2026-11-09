"""T398 PR 2: one tile per house type: its NE (or SE) corner picture with the front wall of its footprint box drawn (L = the +y face for NE; R = the +x face for SE) and ticks every 10%
labelled 0..10 from the lot frame's left (as seen from the street): the door's place along the front wall can be read off. usage: CE_ROOT=<repo> HOUSE_DUMP=<json of {id: {item, views}} from the library> house-wall-tiles.py out.png NE|SE [ids...]"""
import sys, json, os
from PIL import Image, ImageDraw, ImageFont
SRC = os.environ.get('CE_ROOT', '.')
dump = json.load(open(os.environ['HOUSE_DUMP']))
try: F = ImageFont.truetype('arialbd.ttf', 13); FB = ImageFont.truetype('arialbd.ttf', 14)
except Exception: F = FB = ImageFont.load_default()
out, which = sys.argv[1], sys.argv[2]; ids = sys.argv[3:] or list(dump)
CW, CH, COLS = 376, 300, 5
rows = (len(ids) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * CW, rows * CH), (112, 118, 124)); sd = ImageDraw.Draw(sheet)
for k, tid in enumerate(ids):
    d = dump[tid]; c = 0 if which == 'NE' else 1; v = d['views'][c]
    im = Image.open(f'{SRC}/art/building-views/{tid.replace(":", "-")}/{which}.png').convert('RGBA')
    s = v['w'] / im.width; b = v['boxes'][0]; hx, hy = b['hx'], b['hy']; ax, ay = v['ax'] / s, v['ay'] / s
    P = lambda x, y: (ax + (x - y) * 32 / s, ay + (x + y) * 16 / s)
    bg = Image.new('RGBA', im.size, (112, 118, 124, 255)); bg.alpha_composite(im); bg = bg.convert('RGB'); g = ImageDraw.Draw(bg)
    # NE: the front is the +y face, lot x runs +world x: from (-hx, hy) to (hx, hy). SE: the front is the +x face, lot x runs -world y: from (hx, hy) to (hx, -hy)
    a, z = (P(-hx, hy), P(hx, hy)) if which == 'NE' else (P(hx, hy), P(hx, -hy))
    g.line([a, z], fill=(255, 40, 40), width=4)
    for i in range(11):
        t = i / 10; q = (a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t); g.ellipse([q[0] - 5, q[1] - 5, q[0] + 5, q[1] + 5], outline=(255, 255, 0), width=2)
        if i % 2 == 0: g.text((q[0] - 4, q[1] + 6), str(i), fill=(255, 255, 255), font=F)
    sc = min((CW - 6) / bg.width, (CH - 24) / bg.height); bg = bg.resize((int(bg.width * sc), int(bg.height * sc)), Image.LANCZOS)
    x0, y0 = (k % COLS) * CW, (k // COLS) * CH
    sheet.paste(bg, (x0 + (CW - bg.width) // 2, y0 + 22)); sd.text((x0 + 4, y0 + 2), f'{k}: {tid[:44]}', fill=(255, 245, 190), font=FB)
sheet.save(out); print(sheet.size, len(ids))
