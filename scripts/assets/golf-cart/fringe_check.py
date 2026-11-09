"""T351 (#994): the edge check of the cart's six cut pictures (art/golf-cart-20261109/cut/*.native.png). An edge pixel (alpha 8 to 247) is compared with the colour of the nearest solid pixels:
  - "halo": next to a DARK neighbour (luminance under 90), how often the edge pixel is more than 60 levels brighter (paper or background that survived the keying shows there as a light rim), and
    the median brightening;
  - "fringe": how often the edge pixel's lowest channel is more than 40 above its neighbour's (a whitish rim).
Run on the corners keyed with the paper's colour alpha-bled only (the first try: 52% of edge pixels at dark edges were over 60 brighter, median +61) and on the sheet's paper-unmixed keying
(7%, median +17), against the axis views cleaned the T398 way (0.0-0.2%, median +3 to +7)."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
HERE = Path(__file__).resolve().parent; ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / 'straight-views'))
from clean_sheet import nearest_solid

def check(path):
    A = np.array(Image.open(path).convert('RGBA')); al = A[..., 3]; rgb = A[..., :3].astype(np.float32)
    solid = al >= 248; semi = (al >= 8) & (al < 248)
    col, filled = nearest_solid(rgb, solid, 4); m = semi & filled
    lum = lambda c: 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2]
    ln, lp = lum(col)[m], lum(rgb)[m]; dark = ln < 90
    return {'edge': int(m.sum()), 'fringe': float(100 * ((rgb.min(2) - col.min(2))[m] > 40).mean()), 'dark': int(dark.sum()),
            'halo': float(100 * ((lp - ln)[dark] > 60).mean()) if dark.any() else 0.0, 'median': float(np.median((lp - ln)[dark])) if dark.any() else 0.0}

if __name__ == '__main__':
    files = sys.argv[1:] or sorted(str(p) for p in (ROOT / 'art/golf-cart-20261109/cut').glob('*.native.png'))
    worst = 0.0
    for f in files:
        r = check(f); worst = max(worst, r['halo'])
        print(f"{Path(f).name:26s} edge px {r['edge']:6d}  fringe {r['fringe']:4.1f}%  at dark edges (n={r['dark']}): halo {r['halo']:4.1f}% median +{r['median']:.1f}")
    sys.exit(1 if worst > 12.0 else 0)
