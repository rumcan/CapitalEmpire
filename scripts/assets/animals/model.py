"""T309: the aligned splat model of one animal, in the model frame (u forward along the long axis, v lateral, z up from the hooves, units of
Idol's world), and the repairs that do not depend on a pose: the unseen side rebuilt from the seen one (the body mirrored across the midplane),
the head's far side coloured from its near side, stray colours (gold rim light, specks) taken out.
usage (as a module): m = load_aligned(id); m = repair(m)"""
import json, math, sys
from common import *
import numpy as np, torch
from idol_models import clean, OUT, PITCH
from render_iso import load

RPX = 640 / (2 * 0.62)  # the old render's px per unit; meta['scale'] x RPX = the art's px per unit


class Model:
    pass


def load_aligned(iid):
    m = json.loads((OUT / iid / 'meta.json').read_text())
    xyz, cov, col, op = clean(*load(str(OUT / iid / f'{iid}.ply'), DEV))
    th = math.radians(m['axis_deg']); ys = math.radians(m['yaw_src_deg'])
    fwd = -torch.tensor([math.sin(ys) * math.cos(PITCH), math.cos(ys) * math.cos(PITCH), math.sin(PITCH)])
    right = torch.nn.functional.normalize(torch.linalg.cross(fwd, torch.tensor([0., 0., 1.])), dim=0)
    a = torch.tensor([math.cos(th), math.sin(th), 0.]); nose_right = m['h_src'] in (0, 6, 7)
    if (float(a @ right) > 0) != nose_right: th += math.pi
    B = torch.tensor([[math.cos(th), math.sin(th), 0.], [-math.sin(th), math.cos(th), 0.], [0., 0., 1.]], device=DEV)  # world -> (u, v, z)
    p = xyz @ B.T; cov = B @ cov @ B.T
    o = op.reshape(-1); P = p[o > 0.5].cpu().numpy()
    u0, u1 = np.percentile(P[:, 0], [0.5, 99.5]); vmid = float(np.median(P[:, 1]))
    # the ground: the lowest hooves (thin, half-transparent legs sit below the opaque body's 0.5th percentile: the sheep's did)
    z0 = float(np.percentile(p[o > 0.15][:, 2].cpu().numpy(), 0.15)); z1 = float(np.percentile(P[:, 2], 99.7))
    off = torch.tensor([float((u0 + u1) / 2), float(vmid), float(z0)], dtype=torch.float32, device=DEV)
    p = p - off
    M = Model(); M.id = iid; M.meta = m; M.B = B; M.off = off; M.p = p; M.cov = cov; M.col = col; M.op = o
    M.L = float(u1 - u0); M.h = float(z1 - z0); M.px_per_unit = m['scale'] * RPX
    # which side of the midplane the source picture saw: the sign of the camera's v component
    y0 = m['camera']['yaw']; cam = torch.tensor([math.sin(y0), math.cos(y0), 0.], device=DEV)
    M.seen = 1.0 if float((B @ cam)[1]) > 0 else -1.0
    return M


def world(M, p, cov=None):
    """model-frame points (and covariances) back to the render's world"""
    w = (p + M.off) @ M.B
    return w if cov is None else (w, M.B.T @ cov @ M.B)


def mirror_cov(cov):
    S = torch.diag(torch.tensor([1., -1., 1.], device=cov.device)); return S @ cov @ S


def knn_colour(src_p, src_col, q, chunk=2048, tol=None):
    """colour of the nearest src point for each q (and the distance)"""
    out = torch.empty(len(q), 3, device=q.device); dist = torch.empty(len(q), device=q.device)
    for i in range(0, len(q), chunk):
        d, k = torch.cdist(q[i:i + chunk], src_p).min(1); out[i:i + chunk] = src_col[k]; dist[i:i + chunk] = d
    return out, dist


def mirror_body(M, u_split, band=0.03):
    """the far half of everything behind u_split (the body, legs, tail and the neck up to the poll) is the near half mirrored across the
    midplane (v = 0): the seen side was painted from the picture, the far side was Idol's guess. The midline band keeps its splats but takes
    the nearest seen colour."""
    v = M.p[:, 1] * M.seen; u = M.p[:, 0]
    body = u < u_split
    near = body & (v > band); spine = body & (v.abs() <= band); far = body & (v < -band)
    # the midline band: the seen side's colour
    if spine.any():
        c, d = knn_colour(M.p[near], M.col[near], M.p[spine]); M.col[spine] = torch.where((d < 0.03)[:, None], c, M.col[spine])
    keep = ~far
    pm = M.p[near].clone(); pm[:, 1] *= -1
    M.p = torch.cat([M.p[keep], pm]); M.cov = torch.cat([M.cov[keep], mirror_cov(M.cov[near])])
    M.col = torch.cat([M.col[keep], M.col[near]]); M.op = torch.cat([M.op[keep], M.op[near]])
    M.mirrored = torch.cat([torch.zeros(int(keep.sum()), dtype=torch.bool, device=DEV), torch.ones(int(near.sum()), dtype=torch.bool, device=DEV)])
    return M
