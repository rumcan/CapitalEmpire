"""T351 (#994): what the importer needs for the hire golf cart's six new pictures and nobody can eyeball: their display scale against the existing cart pictures, and where the
cart's anchor lies on each. Reads the cut pictures (art/golf-cart-20261109/src, prep_cart.py), the two existing pictures' exports and their library rows (business-library.ts).
  python measure.py        writes art/golf-cart-20261109/measurements.json

Scale. The roof is one flat cream panel, seen from every side, and its HORIZONTAL width does not depend on the camera's pitch, so it measures the scale between pictures: the sheet's
bottom-row corners (the same headings as the old SE and SW) have roofs 325 and 331 px wide, the old pictures' 244 and 250, so an old native pixel is 0.753 of a new one. The old
pictures are drawn at kLib library px per native px (their library width over their file's), so the new pictures take kLib x 0.753: the cart keeps the size the game gives it (owner
size 0.294), and the roofs of all four corners (325-339 px) and of the four axis views (328-334 px implied by their widths and the 8 degree turn) agree to 2%: one scale for the six.
Anchor. The old pictures' library anchor lies under their roof's centroid (+-5 px) and DROP native px below it (the cart's floor): the new anchor is the roof's centroid and that drop at
the new scale, times the cosine of the picture's pitch (a corner's pitch is arcsin of its roof's height over its width; the axis views, which show the roof head on, take the mean of
the four corners'). Checked against the wheel hubs and tyre bottoms read by eye (within about 20 native px, under 2 px at the closest zoom).
"""
import json, re, sys
from pathlib import Path
import numpy as np
from PIL import Image
HERE = Path(__file__).resolve().parent; ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / 'straight-views'))
from clean_sheet import components
SRC = ROOT / 'art/golf-cart-20261109/src'; EXPORTS = ROOT / 'art/theme-consistency/exports/cars'

def roof(path):
    """the cream roof panel (the largest cream piece) of a picture: its centroid, bounding box and size"""
    A = np.array(Image.open(path).convert('RGBA')).astype(int)
    R, G, B, al = A[..., 0], A[..., 1], A[..., 2], A[..., 3]
    m = (al > 200) & (R >= 215) & (G >= 180) & (B >= 120) & (R - B >= 25) & (R - B <= 110) & (R >= G)
    lab = components(m, ds=2); ids, counts = np.unique(lab[lab > 0], return_counts=True)
    ys, xs = np.nonzero(lab == ids[counts.argmax()])
    return {'cx': round(float(xs.mean()), 1), 'cy': round(float(ys.mean()), 1), 'w': int(xs.max() - xs.min() + 1), 'h': int(ys.max() - ys.min() + 1), 'area': int(counts.max()), 'picture': [A.shape[1], A.shape[0]]}

def library_row(id):
    text = (ROOT / 'src/game/business-library.ts').read_text(encoding='utf-8')
    m = re.search(r'"id":"%s","name":"[^"]*","cat":"[^"]*","kind":"[^"]*","w":([0-9.]+),"h":([0-9.]+),"ax":([0-9.]+),"ay":([0-9.]+)' % re.escape(id), text)
    assert m, id
    return dict(zip(('w', 'h', 'ax', 'ay'), map(float, m.groups())))

out = {'schema': 1, 'old': {}, 'new': {}}
kl, drops, pitches_old, ratios = [], [], [], []
for old_key, bottom in (('se', 'unused-corners-bottom-right'), ('sw', 'unused-corners-bottom-left')):
    f = EXPORTS / f'business-golf-cart-{old_key}.native.png'; lib = library_row(f'business:golf-cart-{old_key}')
    r = roof(f); native = r['picture']; k = lib['w'] / native[0]; anchor = (lib['ax'] / k, lib['ay'] / k)    # the library anchor on the file's own pixels
    rb = roof(SRC / f'{bottom}.png'); ratio = r['w'] / rb['w']
    out['old'][old_key] = {'file': f.relative_to(ROOT).as_posix(), 'library': lib, 'kLib': round(k, 4), 'roof': r, 'anchorNative': [round(anchor[0], 2), round(anchor[1], 2)],
                           'dx': round(anchor[0] - r['cx'], 1), 'dy': round(anchor[1] - r['cy'], 1), 'sameHeadingNewRoof': rb, 'ratio': round(ratio, 4)}
    kl.append(k); drops.append(anchor[1] - r['cy']); pitches_old.append(np.arcsin(r['h'] / r['w'])); ratios.append(ratio)
ratio = float(np.mean(ratios)); kLib = float(np.mean(kl)); k = kLib * ratio
pitch_new = {}
for key in ('normalSW', 'normalNW'):
    r = roof(SRC / f'{key}.png'); pitch_new[key] = float(np.arcsin(r['h'] / r['w'])); out['new'][key] = {'roof': r}
bottom_pitch = [float(np.arcsin(out['old'][o]['sameHeadingNewRoof']['h'] / out['old'][o]['sameHeadingNewRoof']['w'])) for o in ('se', 'sw')]
p_corner_mean = float(np.mean(pitches_old + list(pitch_new.values())))     # (the sheet's bottom row is not used: it is the outlier, see below)
drop_old = float(np.mean(drops) / np.cos(np.mean(pitches_old)))             # the roof-to-floor drop at cos 1, in old native px
drop_new = drop_old / ratio
for key in ('yaw8N', 'yaw8E', 'yaw8S', 'yaw8W'): out['new'][key] = {'roof': roof(SRC / f'{key}.png')}
for key, v in out['new'].items():
    p = pitch_new.get(key, p_corner_mean); r = v['roof']
    v['pitchDeg'] = round(float(np.degrees(p)), 1); v['anchor'] = {'x': r['cx'], 'y': round(r['cy'] + drop_new * float(np.cos(p)), 1)}
out['pitchDeg'] = {'old': [round(float(np.degrees(x)), 1) for x in pitches_old], 'newCorners': {k2: round(float(np.degrees(x)), 1) for k2, x in pitch_new.items()}, 'bottomRowCorners (not used)': [round(float(np.degrees(x)), 1) for x in bottom_pitch], 'straightViewsTake': round(float(np.degrees(p_corner_mean)), 1)}
out['ratioOldToNew'] = round(ratio, 4); out['kLibOld'] = round(kLib, 4); out['k'] = round(k, 4); out['dropNewAtCos1'] = round(drop_new, 1)
(ROOT / 'art/golf-cart-20261109/measurements.json').write_text(json.dumps(out, indent=1) + '\n')
print('ratio old/new', round(ratio, 4), 'kLib', round(kLib, 4), '-> k', round(k, 4), 'drop', round(drop_new, 1)); print(json.dumps(out['pitchDeg']))
for key, v in out['new'].items(): print(key.ljust(9), 'roof', v['roof']['w'], 'x', v['roof']['h'], 'pitch', v['pitchDeg'], 'anchor', v['anchor'])
