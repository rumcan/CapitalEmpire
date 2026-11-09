"""T398: key and clean one axisturn sheet (RGBA from the runner) before the cutter sees it.
 1. per cell (the cutter's own split, w//2 / h//2): drop debris (components of the alpha>T mask, bridged by a few px, that are small against the
    cell's main body and not attached to it), and zero faint haze (alpha < 8) everywhere
 2. interior alpha (>= OPAQUE) to 255 (the runner's keyed sheets hold 252-253 for solid pixels)
 3. defringe: a semi-transparent edge pixel takes colour from the nearest solid pixels (alpha-bleed), weighted by how transparent it is, so no background
    colour survives in the antialiased edge
Returns (cleaned RGBA image, report dict)."""
import numpy as np
from PIL import Image
T_SUB = 24      # the cutter's subject threshold (sheets.py trim, import-native.py validate)
OPAQUE = 232    # at or above: solid
HAZE = 8
def shift(a, dy, dx, fill=0):
    H, W = a.shape[:2]
    out = np.full_like(a, fill)
    ys = slice(max(dy, 0), H + min(dy, 0)); yd = slice(max(-dy, 0), H + min(-dy, 0))
    xs = slice(max(dx, 0), W + min(dx, 0)); xd = slice(max(-dx, 0), W + min(-dx, 0))
    out[yd, xd] = a[ys, xs]
    return out
def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        n = out.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx: n |= shift(out, dy, dx, False)
        out = n
    return out
def components(m, ds=4):
    """8-connected labelling (union-find on a 1/ds image: a cell is set when any of its pixels is; the labels are expanded back by pixel repeat)"""
    H, W = m.shape
    h, w = -(-H // ds), -(-W // ds)
    pad = np.zeros((h * ds, w * ds), bool); pad[:H, :W] = m
    small = pad.reshape(h, ds, w, ds).any(axis=(1, 3))
    parent = np.arange(h * w, dtype=np.int64)
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    ys, xs = np.nonzero(small)
    for y, x in zip(ys.tolist(), xs.tolist()):
        i = y * w + x
        for dy, dx in ((0, 1), (1, -1), (1, 0), (1, 1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and small[yy, xx]:
                a, b = find(i), find(yy * w + xx)
                if a != b: parent[max(a, b)] = min(a, b)
    lab = np.zeros(h * w, np.int32)
    for y, x in zip(ys.tolist(), xs.tolist()): lab[y * w + x] = find(y * w + x) + 1
    big = np.repeat(np.repeat(lab.reshape(h, w), ds, axis=0), ds, axis=1)[:H, :W]
    return np.where(m, big, 0)
def nearest_solid(rgb, solid, iters):
    col = rgb.astype(np.float32).copy(); filled = solid.copy()
    for _ in range(iters):
        f = filled.astype(np.float32); acc = np.zeros_like(col); n = np.zeros(solid.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    acc += shift(col * f[..., None], dy, dx, 0); n += shift(f, dy, dx, 0)
        new = (~filled) & (n > 0)
        col[new] = acc[new] / n[new, None]; filled |= new
    return col, filled
def clean(im, bridge=5, min_frac=0.02, defringe=0.85):
    a = np.array(im.convert('RGBA'))
    H, W = a.shape[:2]
    out = a.copy(); rep = {'cells': []}
    for k in range(4):
        x0, y0, x1, y1 = (k % 2) * W // 2, (k // 2) * H // 2, (k % 2 + 1) * W // 2, (k // 2 + 1) * H // 2
        cell = a[y0:y1, x0:x1].copy(); al = cell[..., 3]
        sub = al > T_SUB
        lab = components(dilate(sub, bridge))
        ids, counts = np.unique(lab[lab > 0], return_counts=True)
        main = ids[counts.argmax()]; keep = np.zeros_like(sub)
        removed = 0
        for i, c in zip(ids, counts):
            if i == main or c >= min_frac * counts.max(): keep |= lab == i
            else: removed += 1
        # pixels near kept components (their antialias) survive; everything else goes
        near = dilate(keep, bridge)
        al2 = np.where(near, al, 0).astype(np.uint8)
        al2[al2 < HAZE] = 0
        solid = al2 >= OPAQUE
        rgb = cell[..., :3]
        col, filled = nearest_solid(rgb, solid, 5)
        edge = (al2 > 0) & (~solid) & filled
        w = (defringe * (1.0 - al2.astype(np.float32) / OPAQUE))[..., None]
        newrgb = np.where(edge[..., None], rgb.astype(np.float32) * (1 - w) + col * w, rgb.astype(np.float32))
        al2 = np.where(solid, 255, al2).astype(np.uint8)
        cell[..., :3] = np.clip(newrgb + 0.5, 0, 255).astype(np.uint8)
        cell[..., 3] = al2
        cell[al2 == 0, :3] = 0
        out[y0:y1, x0:x1] = cell
        rep['cells'].append({'cell': k, 'components': int(len(ids)), 'removed': int(removed), 'edge_px': int(edge.sum())})
    return Image.fromarray(out, 'RGBA'), rep
if __name__ == '__main__':
    import sys, json
    im, rep = clean(Image.open(sys.argv[1]))
    im.save(sys.argv[2]); print(json.dumps(rep))
