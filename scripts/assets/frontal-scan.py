# Finds straight-on (front elevation) building sprites: they have mostly horizontal edges, isometric art mostly +-27 degree edges.
# Run from the repo root: python scripts/assets/frontal-scan.py output/frontal-scan.json  (prints the top 70; a score above ~1.1 that is
# not in src/game/lots/frontal.ts is a candidate: check it by eye, then add it to FRONTAL).
import json, re, sys
import numpy as np
from PIL import Image
lib = [json.loads(l.strip().rstrip(',')) for l in open('src/game/library.ts', encoding='utf-8') if l.startswith('  {"id":')]
fr = set(re.findall(r"'([^']+)'", open('src/game/lots/frontal.ts', encoding='utf-8').read().split('new Set<string>([')[1]))
pages = {}
rows = []
for it in lib:
    if it.get('kind') not in ('house', 'building') or 'tex' not in it: continue
    p, u0, v0, u1, v1 = it['tex']
    if p not in pages: pages[p] = Image.open(f'src/assets/atlas/sprites-{p}-0.webp').convert('RGBA')
    W, H = pages[p].size
    im = pages[p].crop((round(u0*W), round(v0*H), round(u1*W), round(v1*H)))
    a = np.asarray(im).astype(float); al = a[..., 3] / 255
    g = (a[..., :3].mean(axis=2)) * al
    gx = np.zeros_like(g); gy = np.zeros_like(g)
    gx[:, 1:-1] = g[:, 2:] - g[:, :-2]; gy[1:-1, :] = g[2:, :] - g[:-2, :]
    mag = np.hypot(gx, gy); inner = al > 0.99
    m = mag * inner
    ang = (np.degrees(np.arctan2(gy, gx)) + 180) % 180  # gradient direction; edge direction = +90
    edge = (ang + 90) % 180
    def band(c, w=6): d = np.abs(((edge - c + 90) % 180) - 90); return m[d < w].sum()
    horiz = band(0); diag = band(26.6) + band(153.4)
    rows.append((horiz / max(diag, 1), it['id'], it.get('cat'), it['id'] in fr))
rows.sort(reverse=True)
json.dump(rows, open(sys.argv[1], 'w'))
for r in rows[:70]: print(f'{r[0]:.2f} {"F" if r[3] else "-"} {r[2][:18]:18} {r[1]}')
