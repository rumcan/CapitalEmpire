"""T398: key, clean and repack one axisturn sheet before the cutter (sheets.py cut via import-native.py) sees it. Pixel-preserving apart from the clean-up:
 1. the sheet's solid pixels (alpha > 24, the cutter's subject threshold) are grouped into buildings: components of the mask bridged by a few px; the four
    largest are the four views (top left N, top right E, bottom left S, bottom right W, by where their centre lies); smaller pieces near one (a porch rail, a
    sign, a stray hedge) belong to it, specks and haze belong to none and are dropped
 2. each view keeps its pixels and their antialiased edge; alpha under 8 is zeroed, solid alpha (>= 232: the runner's keyed sheets hold 252-253) becomes 255,
    and an edge pixel takes colour from the nearest solid pixels, weighted by its transparency (alpha-bleed, no background colour in the edge)
 3. the four views are repacked into a clean 2x2 sheet, each centred in its cell with a wide clear margin (a building that ran over the sheet's midline is no
    longer clipped by the cutter's quadrant split). No resizing, no repainting, no mirroring.
Returns (sheet image or None, report dict)."""
import numpy as np
from PIL import Image
from clean_sheet import shift, dilate, components, nearest_solid, T_SUB, OPAQUE, HAZE

def prep(im, bridge=6, attach=40, main_frac=0.04, margin=48, defringe=0.85):
    a = np.array(im.convert('RGBA')); H, W = a.shape[:2]; al = a[..., 3]
    S = al > T_SUB
    lab = components(dilate(S, bridge))
    ids, _ = np.unique(lab[lab > 0], return_counts=True)
    area = {int(i): int(((lab == i) & S).sum()) for i in ids}
    order = sorted(area, key=area.get, reverse=True)
    rep = {'components': len(order), 'areas': [area[i] for i in order[:8]], 'flags': []}
    if len(order) < 4: rep['flags'].append(f'only {len(order)} components'); return None, rep
    mains = [i for i in order[:4] if area[i] >= main_frac * area[order[0]]]
    if len(mains) < 4: rep['flags'].append('fewer than four main components'); return None, rep
    quad = {}
    for i in mains:
        ys, xs = np.nonzero((lab == i) & S); q = (0 if ys.mean() < H / 2 else 2) + (0 if xs.mean() < W / 2 else 1)
        if q in quad: rep['flags'].append(f'two main components in cell {q}'); return None, rep
        quad[q] = i
    # attach: a smaller piece goes to the main component nearest to it within `attach` px (grown together, 1/4 resolution), else it is dropped
    ds = 4; h, w = -(-H // ds), -(-W // ds)
    def small(m): pad = np.zeros((h * ds, w * ds), bool); pad[:H, :W] = m; return pad.reshape(h, ds, w, ds).any(axis=(1, 3))
    grow = {q: small((lab == i) & S) for q, i in quad.items()}
    owner = np.full((h, w), -1, np.int8)
    for q, m in grow.items(): owner[m] = q
    for _ in range(max(1, attach // ds)):
        nxt = owner.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    s = shift(owner, dy, dx, -1); take = (nxt < 0) & (s >= 0); nxt[take] = s[take]
        owner = nxt
    cell_of = {q: set([quad[q]]) for q in quad}; dropped = 0; attached = 0
    for i in order:
        if i in mains: continue
        if area[i] < 40: dropped += 1; continue
        ys, xs = np.nonzero((lab == i) & S)
        votes = owner[np.minimum(ys // ds, h - 1), np.minimum(xs // ds, w - 1)]
        votes = votes[votes >= 0]
        if len(votes) < 0.5 * len(ys): dropped += 1; continue
        q = int(np.bincount(votes).argmax()); cell_of[q].add(i); attached += 1
    rep['attached'] = attached; rep['dropped'] = dropped
    views = {}
    for q in range(4):
        own_core = np.isin(lab, list(cell_of[q])) & S
        own = dilate(own_core, bridge)                       # the antialiased edge of the kept pixels
        al2 = np.where(own, al, 0).astype(np.uint8); al2[al2 < HAZE] = 0
        solid = al2 >= OPAQUE; rgb = a[..., :3]
        col, filled = nearest_solid(rgb, solid, 5)
        edge = (al2 > 0) & (~solid) & filled
        wgt = (defringe * (1.0 - al2.astype(np.float32) / OPAQUE))[..., None]
        newrgb = np.where(edge[..., None], rgb.astype(np.float32) * (1 - wgt) + col * wgt, rgb.astype(np.float32))
        al2 = np.where(solid, 255, al2).astype(np.uint8)
        out = np.zeros((H, W, 4), np.uint8); out[..., :3] = np.clip(newrgb + 0.5, 0, 255).astype(np.uint8); out[..., 3] = al2; out[al2 == 0, :3] = 0
        ys, xs = np.nonzero(al2 > 0)
        views[q] = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        rep.setdefault('views', {})['NESW'[q]] = {'size': [int(views[q].shape[1]), int(views[q].shape[0])], 'edge_px': int(edge.sum()), 'bbox_in_sheet': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]}
    C = max(max(v.shape[0], v.shape[1]) for v in views.values()) + 2 * margin
    sheet = np.zeros((2 * C, 2 * C, 4), np.uint8)
    for q, v in views.items():
        x0 = (q % 2) * C + (C - v.shape[1]) // 2; y0 = (q // 2) * C + (C - v.shape[0]) // 2
        sheet[y0:y0 + v.shape[0], x0:x0 + v.shape[1]] = v
    rep['sheet'] = [2 * C, 2 * C]
    return Image.fromarray(sheet, 'RGBA'), rep

if __name__ == '__main__':
    import sys, json
    out, rep = prep(Image.open(sys.argv[1]))
    print(json.dumps(rep))
    if out: out.save(sys.argv[2])
