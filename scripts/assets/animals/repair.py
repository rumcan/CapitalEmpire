"""T309: repairs of an animal's colours and far side that do not depend on a pose (all in the model frame):
 1. the far half of the body (everything behind the poll) is the seen half mirrored (model.mirror_body);
 2. the head's far side takes the colour of its near side (the head is turned toward the picture's camera, so it has its own midplane);
 3. specks and glints (a splat far from its neighbours' colour) are pulled to the neighbours' (a 3D colour blur on a voxel grid);
 4. per-animal grading (gold rim light off the manes and tails, the sheep's legs, whites that are not cream...)."""
import math
from common import *
from model import *
from rig import JOINTS, kind_of
import numpy as np, torch


def rgb2hsv(c):
    r, g, b = c[:, 0], c[:, 1], c[:, 2]; mx = c.max(1).values; mn = c.min(1).values; d = mx - mn
    h = torch.zeros_like(mx)
    m = d > 1e-6
    hr = ((g - b) / d.clamp(min=1e-6)) % 6; hg = (b - r) / d.clamp(min=1e-6) + 2; hb = (r - g) / d.clamp(min=1e-6) + 4
    h = torch.where(mx == r, hr, torch.where(mx == g, hg, hb)); h = torch.where(m, h, torch.zeros_like(h)) * 60.0
    s = torch.where(mx > 1e-6, d / mx.clamp(min=1e-6), torch.zeros_like(mx))
    return torch.stack([h, s, mx], 1)


def hsv2rgb(hsv):
    h, s, v = hsv[:, 0] / 60.0, hsv[:, 1], hsv[:, 2]
    i = torch.floor(h) % 6; f = h - torch.floor(h)
    p = v * (1 - s); q = v * (1 - s * f); t = v * (1 - s * (1 - f))
    i = i.long()
    r = torch.stack([v, q, p, p, t, v], 1).gather(1, i[:, None])[:, 0]
    g = torch.stack([t, v, v, q, p, p], 1).gather(1, i[:, None])[:, 0]
    b = torch.stack([p, p, t, v, v, q], 1).gather(1, i[:, None])[:, 0]
    return torch.stack([r, g, b], 1)


def lum(c): return 0.2126 * c[:, 0] + 0.7152 * c[:, 1] + 0.0722 * c[:, 2]


def grid_blur(p, val, w, cell, sigma_cells):
    """3D normalized gaussian blur of per-point values on a voxel grid; returns the blurred value at each point. p (N,3), val (N,C), w (N,)"""
    lo = p.min(0).values - 3 * cell; hi = p.max(0).values + 3 * cell
    n = ((hi - lo) / cell).ceil().long() + 1
    idx = ((p - lo) / cell).floor().long().clamp(min=0); idx = torch.minimum(idx, n - 1)
    flat = (idx[:, 0] * n[1] + idx[:, 1]) * n[2] + idx[:, 2]
    C = val.shape[1]; acc = torch.zeros(int(n[0] * n[1] * n[2]), C + 1, device=p.device)
    acc.index_add_(0, flat, torch.cat([val * w[:, None], w[:, None]], 1))
    g = acc.view(int(n[0]), int(n[1]), int(n[2]), C + 1).permute(3, 0, 1, 2)[None]
    r = max(1, int(math.ceil(3 * sigma_cells))); x = torch.arange(-r, r + 1, device=p.device, dtype=torch.float32); k = torch.exp(-x * x / (2 * sigma_cells ** 2)); k = k / k.sum()
    for ax in range(3):
        shape = [1, 1, 1, 1, 1]; shape[2 + ax] = -1
        kk = k.view(shape).repeat(C + 1, 1, 1, 1, 1)
        pad = [0, 0, 0, 0, 0, 0]; pad[2 * (2 - ax):2 * (2 - ax) + 2] = [r, r]
        g = torch.nn.functional.conv3d(torch.nn.functional.pad(g, pad), kk, groups=C + 1)
    g = g[0].permute(1, 2, 3, 0).reshape(-1, C + 1)
    out = g[flat]
    return out[:, :C] / out[:, C:].clamp(min=1e-6)


def head_region(M, J, margin=0.16):
    """the splats of the head: within `margin` of the segment poll -> muzzle (ears, horns and forelock included), in front of the poll's cut"""
    p = M.p; J2 = np.array(J['J2']); Mz = np.array(J['M']); seg = Mz - J2; L2 = float(seg @ seg)
    du = p[:, 0] - float(J2[0]); dz = p[:, 2] - float(J2[1])
    t = (du * float(seg[0]) + dz * float(seg[1])) / L2
    tc = t.clamp(0, 1); d = torch.sqrt((du - tc * float(seg[0])) ** 2 + (dz - tc * float(seg[1])) ** 2)
    return (t > -0.12) & (t < 1.3) & (d < margin) & (p[:, 0] > float(J2[0]) - 0.03), t


def head_transfer(M, J, band=0.012, tol=0.05):
    """the head's far side takes the colours of its near side across the head's own vertical midplane (through the poll and the muzzle)"""
    H, t = head_region(M, J)
    if int(H.sum()) < 100: return 0
    p = M.p
    # the head's midplane: the normal is the head's thinnest direction (3D PCA of its core: a head is turned AND tilted toward the picture's camera, so a
    # vertical plane through poll and muzzle reflects the face onto air); a vertical plane is the fallback when the thin direction is not lateral
    J2 = np.array(J['J2']); seg = np.array(J['M']) - J2; L2 = float(seg @ seg)
    du = p[:, 0] - float(J2[0]); dz = p[:, 2] - float(J2[1]); tt = (du * float(seg[0]) + dz * float(seg[1])) / L2
    tc = tt.clamp(0, 1); dd = torch.sqrt((du - tc * float(seg[0])) ** 2 + (dz - tc * float(seg[1])) ** 2)
    core = H & (dd < 0.065) & (tt > 0.05) & (tt < 1.05) & (M.op > 0.5)
    P = p[core]; c0 = P.mean(0); ev, evec = torch.linalg.eigh(torch.cov((P - c0).T)); nh3 = evec[:, 0]
    if abs(float(nh3[1])) < 0.7:
        rear = H & (t < 0.12); front = H & (t > torch.quantile(t[H], 0.97)); P2 = p[rear].mean(0); M3 = p[front].mean(0)
        d = (M3 - P2)[:2]; d = d / d.norm(); nh3 = torch.stack([-d[1], d[0], torch.zeros((), device=DEV)]); c0 = P2
    y0 = M.meta['camera']['yaw']; pit = math.radians(M.meta.get('pitch', 30))  # (the picture's own camera pitch is not kept: its 30 degrees is the render's; the horizontal part decides)
    cam = M.B @ torch.tensor([math.sin(y0), math.cos(y0), 0.], device=DEV)
    seen = 1.0 if float(nh3 @ cam) > 0 else -1.0
    raw = (p - c0) @ nh3
    near = H & (raw * seen > band); far = H & (raw * seen < -band)
    if int(near.sum()) < 50 or int(far.sum()) < 50: return 0
    q = p[far] - 2 * raw[far][:, None] * nh3[None]
    c, dist = knn_colour(p[near], M.col[near], q)
    ok = dist < tol; ii = far.nonzero().reshape(-1)[ok]
    M.col[ii] = c[ok]
    print(f'  head transfer: head {int(H.sum())} splats, near {int(near.sum())}, far {int(far.sum())}, recoloured {int(ok.sum())}, midplane normal ({float(nh3[0]):+.2f}, {float(nh3[1]):+.2f}, {float(nh3[2]):+.2f})', flush=True)
    return int(ok.sum())


def despeckle(M, cell=0.008, small=1.2, big=3.5, thr=0.24, mix=0.85):
    """pull a splat whose colour is far from its neighbourhood's toward it (glints and dark specks), keeping everything larger than a few cells"""
    w = M.op.clamp(0.05, 1.0)
    cb = grid_blur(M.p, M.col, w, cell, big)
    diff = (M.col - cb).norm(dim=1)
    bad = diff > thr
    M.col = torch.where(bad[:, None], M.col * (1 - mix) + cb * mix, M.col)
    print(f'  despeckle: {int(bad.sum())} splats pulled to their neighbourhood', flush=True)


def limit_highlights(M, cell=0.008, sigma=7.0, knee=1.10, cut=0.65, chroma=0.6):
    """the pictures' baked specular streaks (gold along a topline, a shine on a flank): a splat much brighter than its wide neighbourhood is pulled
    down toward it, and if it is also more saturated than the neighbourhood its saturation goes down too. The broad shading and the dapples stay"""
    w = M.op.clamp(0.05, 1.0)
    cb = grid_blur(M.p, M.col, w, cell, sigma)
    h = rgb2hsv(M.col); hb = rgb2hsv(cb)
    V, S, Vm, Sm = h[:, 2], h[:, 1], hb[:, 2], hb[:, 1]
    # only a COLOURFUL highlight (more saturated than its surroundings: gold on a back, a warm streak): a white fur beside a black patch is brighter than
    # its neighbourhood's mean too, and must stay white
    exc = (V - knee * Vm).clamp(min=0) * (S > Sm + 0.06).float()
    V2 = V - cut * exc
    S2 = torch.where(exc > 0, S - chroma * (S - Sm - 0.04).clamp(min=0), S)
    M.col = hsv2rgb(torch.stack([h[:, 0], S2, V2], 1)).clamp(0, 1)
    print(f'  highlights: {int((exc > 0).sum())} splats pulled down', flush=True)


def thicken_tail(M, u_tail, factor=0.4):
    """a tail (hair) is a sheet with an empty middle: copies of its splats at a fraction of their offset from the midplane close the gap seen from behind"""
    m = (M.p[:, 0] < u_tail) & (M.p[:, 1].abs() > 0.004) & (M.p[:, 2] > 0.05)
    if not m.any(): return
    pc = M.p[m].clone(); pc[:, 1] *= factor
    M.p = torch.cat([M.p, pc]); M.cov = torch.cat([M.cov, M.cov[m]]); M.col = torch.cat([M.col, M.col[m]]); M.op = torch.cat([M.op, M.op[m]])
    print(f'  tail thickened: {int(m.sum())} copies', flush=True)


def fix_colours(M, J, belly, u_back):
    """what the pictures got wrong in each animal's colours (found on the 8-heading sheet): gold rim light on the manes, ears and tails, the grey's
    blue sheen, the Holstein's warm glow on its whites, the sheep's green legs and tan wool"""
    p = M.p; u, z = p[:, 0], p[:, 2]
    hsv = rgb2hsv(M.col); H, S, V = hsv[:, 0], hsv[:, 1], hsv[:, 2]
    head, t = head_region(M, J); kind = M.id.split('-')[0]
    n0 = 0
    if M.id == 'horse-bay':
        # the ears' pale gold tips: dark, as a bay's
        ears = head & (z > J['J2'][1] + 0.035)
        M.col[ears] = M.col[ears] * torch.tensor([0.55, 0.45, 0.40], device=DEV); n0 = int(ears.sum())
    elif M.id == 'horse-grey':
        # a grey's coat is neutral (the pictures' blue sheen and warm rims go), its mane and tail charcoal (the orange crest line goes dark)
        hair = S > 0.30
        S2 = torch.where(hair, torch.full_like(S, 0.10), S * 0.35); V2 = torch.where(hair, V * 0.55, V)
        M.col = hsv2rgb(torch.stack([H, S2, V2], 1)); n0 = int(hair.sum())
    elif M.id == 'cow-brown':
        # the picture's orange is brighter than a brown cow: a little less saturated and darker
        M.col = hsv2rgb(torch.stack([H, S * 0.88, V * 0.95], 1)); n0 = len(H)
    elif M.id == 'cow-holstein':
        # the whites carry a warm orange glow from the picture's light: cream, not gold
        warm = (V > 0.5) & (S > 0.15) & (H >= 10) & (H <= 60)
        S2 = torch.where(warm, S * 0.45, S); V2 = torch.where(V > 0.55, V ** 0.80, V)  # (and the whites brighter: a Holstein's white is white)
        M.col = hsv2rgb(torch.stack([H, S2, V2], 1)); n0 = int(warm.sum())
    elif kind == 'sheep':
        wool = V > 0.45
        # cream wool: the pictures' yellow glow and orange tan are saturation well above the wool's own (about 0.3): a soft cap, and the wool brighter
        S2 = torch.where(wool, torch.where(S < 0.28, S * 0.7, 0.196 + 0.25 * (S - 0.28)), S); V2 = torch.where(wool, V ** 0.74, V)
        col = hsv2rgb(torch.stack([H, S2, V2], 1))
        # the legs below the wool: pale green translucent splats in the pictures; dark, solid
        legs = (z < 0.9 * belly) & ((V < 0.6) | ((H > 60) & (H < 210) & (S > 0.08)))
        base = torch.tensor([0.09, 0.09, 0.10] if M.id == 'sheep-blackface' else [0.21, 0.16, 0.14], device=DEV)
        col[legs] = base * (0.8 + 0.5 * V[legs])[:, None]
        M.op = torch.where(legs, torch.clamp(M.op, min=0.92), M.op)
        M.col = col; n0 = int(legs.sum())
    print(f'  colour fixes ({M.id}): {n0} splats', flush=True)


def neck_offset(M, J):
    """how far the neck's middle is from the body's midplane (seen-side positive): a neck turned toward the picture's camera cannot be mirrored"""
    u, v, z = M.p[:, 0], M.p[:, 1] * M.seen, M.p[:, 2]
    sel = (u > float(J['J0'][0])) & (u < float(J['J2'][0])) & (z > float(J['J0'][1]) - 0.03) & (M.op > 0.5)
    return float(v[sel].median()) if int(sel.sum()) > 50 else 0.0


def smooth_spine(M, u_split, belly):
    """the seam where the mirrored halves meet: the midline band's colours are blurred (a thin dark or bright line along the back is gone)"""
    w = M.op.clamp(0.05, 1.0); cb = grid_blur(M.p, M.col, w, 0.008, 4.0)
    m = (M.p[:, 0] < u_split) & (M.p[:, 1].abs() < torch.where(M.p[:, 2] > belly, 0.05, 0.02))
    M.col = torch.where(m[:, None], 0.3 * M.col + 0.7 * cb, M.col)


def repair(M, steps=('mirror', 'head', 'colours', 'despeckle', 'highlights', 'tail')):
    from rig import Pose
    J = JOINTS[M.id]; P0 = Pose(M); belly, u_back, L = P0.belly, P0.u_back, P0.L
    if 'mirror' in steps:
        # the midline band is wide on the body and the tail (one closed surface), narrow on the legs (their inner sides are the far legs' ghosts)
        band = torch.where(M.p[:, 0] < u_back - 0.07, 0.03, torch.where(M.p[:, 2] > belly, 0.008, 0.012))
        # the neck is mirrored with the body when it lies on the midplane, else (turned toward the camera: it would double) only the body is
        off = neck_offset(M, J) if not M.id.startswith('sheep') else 0.0
        split = float(J['J2'][0]) if abs(off) < 0.025 else float(J['J0'][0]) + 0.03
        print(f'  mirror: neck offset {off:+.3f}, mirrored behind u = {split:.2f}', flush=True)
        mirror_body(M, split, band); smooth_spine(M, split, belly)
    if 'head' in steps: head_transfer(M, J)
    if 'colours' in steps: fix_colours(M, J, belly, u_back)
    if 'despeckle' in steps: despeckle(M, thr=0.20 if M.id.startswith('sheep') else 0.28)
    if 'highlights' in steps: limit_highlights(M)
    # (the mirrored arrays carry a per-splat flag: not needed after this point)
    if 'tail' in steps and M.id.startswith('horse'): thicken_tail(M, u_back - 0.07)
    return M
