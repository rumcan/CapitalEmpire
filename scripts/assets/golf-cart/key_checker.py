"""T351: key a sheet that has a checkerboard baked into its RGB (no alpha channel) into a clean RGBA sheet. The runner's corners sheet of the golf cart
(F:/Art/newArt/animations/buildings/business~golf-cart/corners.png) is one: white and light grey squares of 11 px (254 and 249 of 255), JPEG-noisy.
 1. the background is the near-white, near-neutral pixels (min channel >= BG_MIN, max - min <= BG_SAT) that join the sheet's border (4-connected flood fill),
    and the see-through gaps of the open cart (the windows between the roof posts, the gap behind the seat): enclosed pieces of paper of at least HOLE_MIN px. A
    pale speck inside the cart smaller than that (a chrome highlight on a club) stays part of the cart
 2. the cart's own antialiased edge is the band of up to BAND px between the background and the pixels that are surely the cart (a pixel at least BAND + 1 px from the
    background): there alpha is unmixed against the paper (alpha = how far the pixel is from the paper towards the nearest solid colour), and the colour is
    the nearest solid colour weighted by how transparent the pixel is (alpha-bleed, as clean_sheet.py does for the axisturn sheets), so no paper survives in the edge
 3. nothing is resized, repainted or mirrored; fully clear pixels carry black.
Returns (RGBA ndarray, report)."""
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'straight-views'))
from clean_sheet import shift, dilate, nearest_solid, components

BG_MIN, BG_SAT, BAND, HOLE_MIN = 236, 14, 3, 60

def flood(mask):
    """the 4-connected components of `mask` that touch the sheet's border (iterative scanline-free flood by repeated dilation inside the mask would be slow:
    a union-find over rows is used instead)"""
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32); n = 0
    parent = [0]
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    # two-pass 4-connected labelling, row by row with run-lengths
    prev_runs = []
    for y in range(H):
        row = mask[y]
        d = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
        starts = np.nonzero(d == 1)[0]; ends = np.nonzero(d == -1)[0]
        runs = []
        for s, e in zip(starts.tolist(), ends.tolist()):
            ids = [r[2] for r in prev_runs if r[0] < e and s < r[1]]
            if not ids:
                n += 1; parent.append(n); i = n
            else:
                i = ids[0]
                for j in ids[1:]:
                    a, b = find(i), find(j)
                    if a != b: parent[max(a, b)] = min(a, b)
            lab[y, s:e] = i; runs.append((s, e, i))
        prev_runs = runs
    root = np.array([find(i) for i in range(n + 1)], np.int32)
    lab = root[lab]
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border > 0]
    return np.isin(lab, border)

def key(rgb):
    rgb = rgb.astype(np.int32); H, W, _ = rgb.shape
    mn, mx = rgb.min(2), rgb.max(2)
    paper = (mn >= BG_MIN) & (mx - mn <= BG_SAT)
    bg = flood(paper)
    holes = paper & ~bg
    if holes.any():
        lab = components(holes, ds=1); ids, counts = np.unique(lab[lab > 0], return_counts=True)
        bg = bg | np.isin(lab, ids[counts >= HOLE_MIN])
    near = dilate(bg, BAND)                     # the background and the band of pixels that may be its blend
    solid = ~near                               # surely the cart
    band = near & ~bg
    col, filled = nearest_solid(rgb.astype(np.float32), solid, BAND + 3)
    paper_col = np.array([251.0, 251.0, 251.0], np.float32)
    # unmix: P = a F + (1 - a) B  ->  a = (B - P).(B - F) / |B - F|^2
    d = paper_col[None, None, :] - col                      # B - F
    num = ((paper_col[None, None, :] - rgb) * d).sum(2); den = (d * d).sum(2)
    a = np.where(den > 40.0 ** 2, num / np.maximum(den, 1e-6), np.where(paper, 0.0, 1.0))
    a = np.clip(a, 0.0, 1.0)
    alpha = np.zeros((H, W), np.float32)
    alpha[solid] = 1.0
    use = band & filled
    alpha[use] = a[use]
    # a band pixel that is not paper-like and whose unmixed alpha is tiny is still cart (a dark thin line): keep at least what the paper test says
    alpha[band & ~filled] = np.where(paper[band & ~filled], 0.0, 1.0)
    # colour: solid pixels as they are; band pixels take the nearest solid colour, weighted by their transparency (alpha-bleed)
    out = rgb.astype(np.float32).copy()
    w = (0.85 * (1.0 - alpha))[..., None]
    edge = band & filled
    out = np.where(edge[..., None], out * (1 - w) + col * w, out)
    A = np.zeros((H, W, 4), np.uint8)
    A[..., :3] = np.clip(out + 0.5, 0, 255).astype(np.uint8)
    A[..., 3] = np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)
    A[A[..., 3] < 8, :] = 0                                  # faint haze goes; clear pixels carry black
    A[A[..., 3] >= 248, 3] = 255
    rep = {'paper_frac': float(paper.mean()), 'bg_frac': float(bg.mean()), 'band_px': int(band.sum()), 'solid_px': int(solid.sum()), 'alpha_semi': int(((A[..., 3] > 0) & (A[..., 3] < 255)).sum())}
    return A, rep

if __name__ == '__main__':
    from PIL import Image
    import json
    A, rep = key(np.array(Image.open(sys.argv[1]).convert('RGB')))
    Image.fromarray(A, 'RGBA').save(sys.argv[2]); print(json.dumps(rep))
