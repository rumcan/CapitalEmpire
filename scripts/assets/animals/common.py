"""T309: shared helpers (an explicit-camera splat renderer with extra channels)."""
import json, math, os, sys
from pathlib import Path
for _d in os.environ.get('IDOL_DIRS', 'D:/AI/idol-test;D:/AI/idol-batch').split(';'): sys.path.insert(0, _d)
import numpy as np, torch
from PIL import Image
DEV = 'cuda'


def render_cam(xyz, cov, col, op, right, up, size=800, half=0.775, tile=32, K=4096, center=(0., 0.)):
    """front-to-back alpha compositing of 3D gaussians seen orthographically along fwd = up x right (the renderer of build.py, any camera, any
    number of colour channels). right, up: unit 3-vectors (torch, on DEV). Returns (rgb straight (size,size,C), alpha (size,size))"""
    dev = xyz.device
    P = torch.stack([right, up]); fwd = torch.linalg.cross(up, right)
    m2 = xyz @ P.T; depth = xyz @ fwd
    c2 = P @ cov @ P.T + 1e-6; px = 2 * half / size; c2 = c2 + torch.eye(2, device=dev) * (0.3 * px) ** 2; inv = torch.linalg.inv(c2)
    keep = op >= 1 / 255; order = torch.argsort(depth); order = order[keep[order]]
    m2, inv, col, op, c2 = m2[order], inv[order], col[order], op[order], c2[order]
    tr = (c2[:, 0, 0] + c2[:, 1, 1]) / 2; det = c2[:, 0, 0] * c2[:, 1, 1] - c2[:, 0, 1] ** 2
    lmax = tr + torch.sqrt((tr * tr - det).clamp(min=0)); rad = torch.sqrt(lmax * 2 * torch.log((255 * op).clamp(min=1))) + px
    cx = (m2[:, 0] - center[0] + half) / px - 0.5; cy = (half - (m2[:, 1] - center[1])) / px - 0.5; rp = rad / px
    x0, x1, y0, y1 = cx - rp, cx + rp, cy - rp, cy + rp
    C = col.shape[1]; T = torch.ones(size, size, device=dev); rgb = torch.zeros(size, size, C, device=dev)
    m2c = m2 - torch.tensor(center, device=dev)[None]
    for ty in range(0, size, tile):
        rows = (y1 >= ty) & (y0 <= ty + tile - 1)
        for tx in range(0, size, tile):
            idx = torch.nonzero(rows & (x1 >= tx) & (x0 <= tx + tile - 1)).squeeze(1)
            if idx.numel() == 0: continue
            ys, xs = torch.meshgrid(torch.arange(ty, min(ty + tile, size), device=dev), torch.arange(tx, min(tx + tile, size), device=dev), indexing='ij')
            pix = torch.stack([(xs + 0.5) * px - half, half - (ys + 0.5) * px], -1).view(-1, 2)
            Tt = torch.ones(pix.shape[0], device=dev); rt = torch.zeros(pix.shape[0], C, device=dev)
            for s in range(0, idx.numel(), K):
                j = idx[s:s + K]; dd = pix[:, None, :] - m2c[j][None]; ii = inv[j]
                e = (dd[..., 0] ** 2 * ii[:, 0, 0] + 2 * dd[..., 0] * dd[..., 1] * ii[:, 0, 1] + dd[..., 1] ** 2 * ii[:, 1, 1])
                a = (op[j][None] * torch.exp(-0.5 * e)).clamp(max=0.99); a = torch.where(a < 1 / 255, torch.zeros_like(a), a)
                trans = torch.cumprod(1 - a, 1); excl = torch.cat([torch.ones_like(trans[:, :1]), trans[:, :-1]], 1)
                rt += (Tt[:, None] * excl * a) @ col[j]; Tt = Tt * trans[:, -1]
                if (Tt > 1e-4).sum() == 0: break
            h, w = ys.shape; T[ty:ty + h, tx:tx + w] = Tt.view(h, w); rgb[ty:ty + h, tx:tx + w] = rt.view(h, w, C)
    a = (1 - T).clamp(0, 1)
    return rgb / a.clamp(min=1e-6)[..., None], a


def to_img(rgb, a):
    return Image.fromarray((torch.cat([rgb[..., :3], a[..., None]], -1).clamp(0, 1) * 255).byte().cpu().numpy(), 'RGBA')


def vec(*v): return torch.tensor(v, dtype=torch.float32, device=DEV)
