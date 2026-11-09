"""T351 (#994): the hire golf cart's eight pictures from the lead's two sheets (F:/Art/newArt/animations/buildings/business~golf-cart/):
 corners.png  1254 x 1254 RGB with a checkerboard baked in: 2 x 2, top row the cart driving away (rear three-quarter views), bottom row the cart driving towards us
              (front three-quarter views); top left heading NE, top right NW, bottom left SW, bottom right SE
 axisturn.png 1254 x 1254 RGBA on black with a yellow fringe: front (top left), right side (top right), back (bottom left), left side (bottom right), turned 8 degrees
              like the buildings' straight-on views (T398); the cart's heading is S, E, N, W
The corners are keyed (key_checker.py), the axis sheet is cleaned with T398's prep_sheet.py (alpha under 8 zeroed, solid alpha to 255, edge colour from the nearest solid
pixels); nothing is resized, repainted or mirrored. Each view is then trimmed to its pixels and saved with an 8 px clear margin as <ring key>.png, the per-view
sources import-object-eight.mjs takes (the ring NE N SE E SW S NW W of an object-eight set is the way the front faces: the NE view's front to +y, the screen's lower
left, the N view's to the screen's bottom, ...).
  python prep_cart.py [--src DIR] [--out DIR]"""
import sys, json, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent / 'straight-views'))
import key_checker
from clean_sheet import components, dilate, T_SUB
from prep_sheet import prep

a = sys.argv[1:]
def opt(k, d): return a[a.index(k) + 1] if k in a else d
SRC = Path(opt('--src', 'F:/Art/newArt/animations/buildings/business~golf-cart')); OUT = Path(opt('--out', 'art/golf-cart-20261109/src'))
MARGIN = 8
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()

def four_views(A, bridge=6):
    """the four views of a keyed RGBA sheet (its four largest pieces, a piece joining the cell its middle lies in), each trimmed to its pixels: [TL, TR, BL, BR]"""
    H, W = A.shape[:2]; S = A[..., 3] > T_SUB
    lab = components(dilate(S, bridge)); ids, _ = np.unique(lab[lab > 0], return_counts=True)
    area = {int(i): int(((lab == i) & S).sum()) for i in ids}; order = sorted(area, key=area.get, reverse=True)
    assert len(order) >= 4, f'only {len(order)} pieces'
    quad = {}
    for i in order[:4]:
        ys, xs = np.nonzero((lab == i) & S); q = (0 if ys.mean() < H / 2 else 2) + (0 if xs.mean() < W / 2 else 1)
        assert q not in quad, 'two pieces in one cell'; quad[q] = i
    views = []
    for q in range(4):
        own = dilate((lab == quad[q]) & S, bridge); al = np.where(own, A[..., 3], 0).astype(np.uint8)
        V = A.copy(); V[..., 3] = al; V[al == 0, :3] = 0
        ys, xs = np.nonzero(al > 0); views.append(V[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    return views

def save(V, key):
    H, W = V.shape[:2]; P = np.zeros((H + 2 * MARGIN, W + 2 * MARGIN, 4), np.uint8); P[MARGIN:MARGIN + H, MARGIN:MARGIN + W] = V
    OUT.mkdir(parents=True, exist_ok=True); f = OUT / f'{key}.png'; Image.fromarray(P, 'RGBA').save(f, optimize=True)
    return {'file': f.name, 'size': [P.shape[1], P.shape[0]], 'subject': [W, H], 'sha256': sha(f)}

corners_f, axis_f = SRC / 'corners.png', SRC / 'axisturn.png'
C, crep = key_checker.key(np.array(Image.open(corners_f).convert('RGB')))
TL, TR, BL, BR = four_views(C)
sheet, arep = prep(Image.open(axis_f)); assert sheet is not None, arep
S = np.array(sheet); ax_views = four_views(S)          # the repacked sheet: N (top left), E, S, W in its cells
N, E, Sv, Wv = ax_views
cells = {'yaw8N': (N, 'axisturn top left: the front to the screen bottom (heading S)'),
         'yaw8E': (E, 'axisturn top right: the right side, the front to the right (heading E)'),
         'normalSW': (TL, 'corners top left: the back to the camera, the front to the upper right (heading NE)'), 'yaw8S': (Sv, 'axisturn bottom left: the back, the front to the screen top (heading N)'),
         'normalNW': (TR, 'corners top right: the back to the camera, the front to the upper left (heading NW)'), 'yaw8W': (Wv, 'axisturn bottom right: the left side, the front to the left (heading W)'),
         # the bottom row of the corners sheet is kept but not used: drawn from a higher camera (roof height / width 0.58-0.60, 36 degrees) than every other picture (0.43-0.50) and a
         # paler roof; the game's own SE and SW pictures (business:golf-cart-se / -sw) are the cart's SE and SW (art/golf-cart-20261109/README.md)
         'unused-corners-bottom-left': (BL, 'corners bottom left (heading SW): not used, the existing golf-cart-sw is'), 'unused-corners-bottom-right': (BR, 'corners bottom right (heading SE): not used, the existing golf-cart-se is')}
rep = {'schema': 1, 'sources': {'corners': {'file': str(corners_f), 'sha256': sha(corners_f), 'key': crep}, 'axisturn': {'file': str(axis_f), 'sha256': sha(axis_f), 'prep': arep}}, 'views': {}}
for key, (V, what) in cells.items():
    r = save(V, key); r['from'] = what; rep['views'][key] = r; print(key.ljust(28), r['subject'], what)
REPORT = OUT.parent / 'prep-report.json'; REPORT.write_text(json.dumps(rep, indent=1) + '\n')   # (the sources' hashes and every picture's: committed; the pictures are not, see art/golf-cart-20261109/.gitignore)
