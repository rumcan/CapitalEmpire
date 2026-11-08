"""T309: an animal's frames for the game, from its repaired aligned model (model.py), posed (rig.py) and lit by the game's sun (upper right).

Rows are the 8 headings (CAR_DIRECTIONS order: k 0 SE .. 7 E, the nose on screen), never mirrored, at the people's art scale (a 1.78 m person =
190 px; the game draws at k = 0.5). A heading's 15 frames: graze 0-3 (head down, a slow nod, the tail swishing), lookup 4-6 (the head coming up:
2/3, 1/3, up; played backwards to put it down again), walk 7-14 (a four-beat walk, the feet lifting).

Light: the splats keep their albedo; each frame is rendered as albedo + depth + height, and lit in the image: normals from the (smoothed) depth, a soft
key from the upper right with a cool sky fill, a darker underside, depth-unsharp ambient occlusion in the creases and a little darkening near the ground.

usage: python build.py <id> [--only-headings 0,2] [--frames 0,5,9] [--strip out.png] [--sheet] [--nopose]"""
import argparse, json, math, sys, time
from pathlib import Path
from common import *
from model import load_aligned, world, RPX
from rig import Pose, GRAZE, kind_of
import torch.nn.functional as F
import numpy as np, torch
from PIL import Image

PITCH = math.radians(30); SIZE, HALF = 800, 0.775; PX_PER_M = 190 / (1.78 * math.cos(PITCH))
from idol_models import REPO, WORK
BUILD = WORK / 'build'
NAMES = ['SE', 'S', 'SW', 'W', 'NW', 'N', 'NE', 'E']
CLIPS = [('graze', 4, [0, 0.7, 1.4, 2.1], True), ('lookup', 3, [0, 0.22, 0.44], False), ('walk', 8, [round(i * 0.16, 2) for i in range(8)], True)]
FRAMES = sum(c[1] for c in CLIPS)
# the game's walking speed (tiles a second, ext/farms/animals.ts ANIMAL_SPEED) and the walk's frame time (WALK_FRAME_S) by kind: the art's stride matches them
SPEED_TILES = {'horse': 0.40, 'cow': 0.28, 'sheep': 0.20}; FRAME_S = {'horse': 0.16, 'cow': 0.16, 'sheep': 0.11}
LIGHT = dict(L=(0.50, 0.72, 0.48), wrap=0.3, shadow=(0.75, 0.80, 0.91), light=(1.17, 1.13, 1.04), sky=0.16, edge=4.0, sd=2.2, ao=0.40, ground=0.22)
# a sheep's wool is rough on the scale of the normals: a wider smoothing, little creasing
LIGHT_BY_KIND = {'horse': dict(sd=2.4, ao=0.35), 'cow': dict(sd=2.8, ao=0.30), 'sheep': dict(sd=5.5, ao=0.10, edge=3.0)}


def cam(yaw):
    d = torch.tensor([math.sin(yaw) * math.cos(PITCH), math.cos(yaw) * math.cos(PITCH), math.sin(PITCH)], device=DEV); fwd = -d
    right = torch.nn.functional.normalize(torch.linalg.cross(fwd, torch.tensor([0., 0., 1.], device=DEV)), dim=0)
    return right, torch.linalg.cross(right, fwd)


def to_px(xyz, yaw):
    r, u = cam(yaw); px = 2 * HALF / SIZE
    return torch.stack([(xyz @ r + HALF) / px - 0.5, (HALF - xyz @ u) / px - 0.5], 1)


def gk(sigma):
    r = max(1, int(math.ceil(3 * sigma))); x = torch.arange(-r, r + 1, device=DEV, dtype=torch.float32); k = torch.exp(-x * x / (2 * sigma * sigma)); return k / k.sum(), r


def blur(x, sigma):
    """separable gaussian blur of (H, W) or (H, W, C) (replicate padding)"""
    k, r = gk(sigma); sq = x.dim() == 2
    t = (x[None, None] if sq else x.permute(2, 0, 1)[:, None])
    t = F.pad(t, (r, r, 0, 0), mode='replicate'); t = F.conv2d(t, k.view(1, 1, 1, -1))
    t = F.pad(t, (0, 0, r, r), mode='replicate'); t = F.conv2d(t, k.view(1, 1, -1, 1))
    return t[0, 0] if sq else t[:, 0].permute(1, 2, 0)


def relight(alb, depth, hgt, a, px_u, cfg=LIGHT):
    """albedo (H, W, 3) -> lit colour: the normals from the smoothed depth (plus the alpha's edge), the sun upper right"""
    ab = a.clamp(0, 1)
    Db = blur(depth * ab, cfg['sd']) / blur(ab, cfg['sd']).clamp(min=1e-3)
    grow, gcol = torch.gradient(Db, spacing=px_u)
    nx, ny, nz = gcol, -grow, torch.ones_like(gcol)
    ae = blur(ab, 1.6); arow, acol = torch.gradient(ae)
    nx = nx + cfg['edge'] * (-acol); ny = ny + cfg['edge'] * arow
    n = torch.stack([nx, ny, nz], -1); n = n / n.norm(dim=-1, keepdim=True)
    L = torch.tensor(cfg['L'], device=DEV); L = L / L.norm()
    ndl = (n * L).sum(-1)
    t = ((ndl + cfg['wrap']) / (1 + cfg['wrap'])).clamp(0, 1)  # 0 shadow .. 1 full light (a surface facing the viewer is about 0.6)
    world_up = n[..., 1] * math.cos(PITCH) + n[..., 2] * math.sin(PITCH)
    sky = (0.5 + 0.5 * world_up).clamp(0, 1)
    sh = torch.tensor(cfg['shadow'], device=DEV); li = torch.tensor(cfg['light'], device=DEV)
    shade = (sh + (li - sh) * t[..., None]) * (1 - cfg['sky'] / 2 + cfg['sky'] * sky)[..., None]
    # ambient occlusion: a point deeper than its wide neighbourhood sits in a crease
    Dw = blur(depth * ab, 9.0) / blur(ab, 9.0).clamp(min=1e-3)
    occ = ((depth - Dw) / 0.05).clamp(0, 1) * (ab > 0.5)
    ao = 1 - cfg['ao'] * occ
    gr = 1 - cfg['ground'] * torch.exp(-hgt / 0.10)
    out = alb * shade * (ao * gr)[..., None]
    return out.clamp(0, 1)


def build_frames(P):
    """the 15 poses of the animal (dicts for Pose.front_pose / legs_tail)"""
    M = P.M; kind = kind_of(M.id); g = GRAZE[kind]
    th, mz, t0, hd = P.solve_graze(g['drop'], g['sigma'], target=g['target'])
    print(f'  graze: neck {t0:.0f} deg, head {hd:.0f} deg, muzzle z {mz:.3f} ({mz / P.h:.2f} h), drop {g["drop"]}, stretch {g["sigma"]}', flush=True)
    T = math.radians(22); frames = []
    for dn, tl in ((0, 0), (-5, T), (-2, 0), (4, -T)):
        frames.append(dict(front=((th[0], th[1], th[2] + math.radians(dn)), g['sigma'], g['drop']), tail=tl))
    for k in (0.66, 0.33, 0.0):
        frames.append(dict(front=(tuple(x * k for x in th), g['sigma'] * k, g['drop'] * k)))
    # the stride: the foot's travel while it is down (half the cycle) is the ground the animal covers in that time, so the feet do not skate
    m_unit = M.px_per_unit / PX_PER_M; leg_m = P.pivot_z * m_unit
    stance_m = SPEED_TILES[kind] * 2.0 * (4 * FRAME_S[kind]); A = math.asin(min(0.5, stance_m / (2 * leg_m))); LIFT = 0.05
    print(f'  walk: leg {leg_m:.2f} m, stance {stance_m:.2f} m, swing +-{math.degrees(A):.1f} deg', flush=True)
    for f in range(8):
        t = f / 8 * 2 * math.pi; ph = {'LH': 0, 'LF': 0.25, 'RH': 0.5, 'RF': 0.75}
        s = {k: A * math.sin(t - 2 * math.pi * v) for k, v in ph.items()}
        lf = {k: LIFT * max(0.0, math.cos(t - 2 * math.pi * v)) ** 1.5 for k, v in ph.items()}
        frames.append(dict(front=((math.radians(3) * math.sin(2 * t), 0.0, 0.0), 0.0, 0.0), legs=(s['LF'], s['RF'], s['LH'], s['RH']),
                           lift=(lf['LF'], lf['RF'], lf['LH'], lf['RH']), bob=0.01 * math.cos(2 * t), tail=math.radians(9) * math.sin(t)))
    assert len(frames) == FRAMES
    return frames


def pose_frame(P, fr):
    p, cov = P.p, P.cov
    th, sg, dr = fr['front']
    if any(abs(x) > 1e-9 for x in th) or sg or dr: p, cov = P.front_pose(p, cov, th, sg, dr)
    p, cov = P.legs_tail(p, cov, legs=fr.get('legs', (0., 0., 0., 0.)), lift=fr.get('lift', (0., 0., 0., 0.)), bob=fr.get('bob', 0.0), tail=fr.get('tail', 0.0))
    return p, cov


def render_heading(M, p, cov, k, alb, op, pose_h):
    m = M.meta; ys, s = math.radians(m['yaw_src_deg']), m['sign']
    yaw = ys + s * math.radians(45 * ((k - m['h_src']) % 8))
    right, up = cam(yaw); fwd = torch.linalg.cross(up, right)
    w, cw = world(M, p, cov)
    depth = (w @ fwd)[:, None]; hgt = (pose_h / M.h)[:, None]
    ch = torch.cat([alb, depth, hgt], 1)
    rgb, a = render_cam(w, cw, ch, op, right, up, SIZE, HALF)
    px_u = 2 * HALF / SIZE
    lit = relight(rgb[..., :3], rgb[..., 3], rgb[..., 4], a, px_u, {**LIGHT, **LIGHT_BY_KIND[kind_of(M.id)]})
    return lit, a, yaw, right, up, w


def run(iid, only_heads=None, only_frames=None, nopose=False, strip=None, sheet=False, repaired=None):
    t0 = time.time()
    M = repaired if repaired is not None else load_aligned(iid)
    P = Pose(M); frames = build_frames(P)
    d = BUILD / iid; d.mkdir(parents=True, exist_ok=True)
    heads = only_heads if only_heads is not None else list(range(8)); fids = only_frames if only_frames is not None else list(range(FRAMES))
    f = M.px_per_unit / RPX; meta = {'id': iid, 'scale': f, 'headings': []}
    ims = {}  # (k, i) -> PIL RGBA at render size
    anchors = {}
    for i in fids:
        p, cov = pose_frame(P, frames[i]) if not nopose else (P.p, P.cov)
        for k in heads:
            lit, a, yaw, right, up, w = render_heading(M, p, cov, k, M.col, M.op, p[:, 2])
            ims[(k, i)] = to_img(lit, a)
            if k not in anchors:
                o = world(M, torch.zeros(1, 3, device=DEV)); anchors[k] = to_px(o, yaw)[0]
    print(f'  rendered {len(ims)} images in {time.time() - t0:.0f}s', flush=True)
    for k in heads:
        boxes = [ims[(k, i)].getbbox() for i in fids]; B = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]
        W, H = max(1, round((B[2] - B[0]) * f)), max(1, round((B[3] - B[1]) * f)); sx, sy = W / (B[2] - B[0]), H / (B[3] - B[1])
        for i in fids: ims[(k, i)].crop(B).resize((W, H), Image.LANCZOS).save(d / f'h{k}_f{i}.png')
        ax, ay = (float(anchors[k][0]) + 0.5 - B[0]) * sx, (float(anchors[k][1]) + 0.5 - B[1]) * sy
        meta['headings'].append({'k': k, 'w': W, 'h': H, 'ax': round(ax, 2), 'ay': round(ay, 2)})
        print(f'  h{k} {NAMES[k]}: {W}x{H} anchor {ax:.1f},{ay:.1f}', flush=True)
    meta['height_m'] = round(M.h * M.px_per_unit / PX_PER_M, 3)
    (d / 'meta.json').write_text(json.dumps(meta, indent=1))
    if strip: make_strip([iid], strip, heads[0] if heads else 2)
    del P; torch.cuda.empty_cache()
    return M


def sheet(iid, length_m):
    d = BUILD / iid; m = json.loads((d / 'meta.json').read_text()); H8 = m['headings']
    assert len(H8) == 8, 'a sheet needs all 8 headings'
    AX = math.ceil(max(h['ax'] for h in H8)) + 2; AY = math.ceil(max(h['ay'] for h in H8)) + 2
    FW = AX + math.ceil(max(h['w'] - h['ax'] for h in H8)) + 2; FH = AY + math.ceil(max(h['h'] - h['ay'] for h in H8)) + 2
    sh = Image.new('RGBA', (FW * FRAMES, FH * 8), (0, 0, 0, 0))
    for h in H8:
        k = h['k']; dx, dy = AX - h['ax'], AY - h['ay']
        for i in range(FRAMES):
            im = Image.open(d / f'h{k}_f{i}.png'); ox, oy = math.floor(dx), math.floor(dy); fx, fy = dx - ox, dy - oy
            if fx or fy: im = im.transform((im.width + 1, im.height + 1), Image.AFFINE, (1, 0, -fx, 0, 1, -fy), resample=Image.BILINEAR)
            sh.alpha_composite(im, (i * FW + ox, k * FH + oy))
    od = REPO / 'art' / 'animals' / iid; od.mkdir(parents=True, exist_ok=True)
    sh.save(od / 'sheet.webp', 'WEBP', quality=92, alpha_quality=100, method=6)
    names = [f'{c}{i + 1}' for c, n, _, _ in CLIPS for i in range(n)]; clips, st = {}, 0
    for c, n, times, loop in CLIPS:
        if c == 'walk': times = [round(i * FRAME_S[kind_of(iid)], 3) for i in range(n)]  # the game's frame time for this kind (WALK_FRAME_S)
        clips[c] = {'start': st, 'n': n, 'times': times, 'loop': loop}; st += n
    js = {'id': iid, 'frameWidth': FW, 'frameHeight': FH, 'anchor': {'x': AX, 'y': AY}, 'directions': NAMES, 'frames': names, 'clips': clips,
          'lengthMetres': length_m, 'heightMetres': m['height_m'], 'pxPerMetre': round(PX_PER_M, 3), 'repainted': list(range(8)), 'v': 2}
    (od / 'sheet.json').write_text(json.dumps(js, indent=1)); print(f'  sheet {od / "sheet.webp"} {FW}x{FH} cells', flush=True)


def make_strip(ids, out, k=2, frames=None, scale=1.0, bg=(128, 150, 96)):
    fr = frames if frames is not None else list(range(FRAMES))
    rows = [[Image.open(BUILD / i / f'h{k}_f{n}.png') for n in fr] for i in ids]
    cw = max(im.width for r in rows for im in r) + 8; ch = max(im.height for r in rows for im in r) + 8
    o = Image.new('RGB', (cw * len(fr), ch * len(rows)), bg)
    for y, r in enumerate(rows):
        for x, im in enumerate(r): o.paste(im, (x * cw + (cw - im.width) // 2, y * ch + ch - im.height - 4), im)
    if scale != 1: o = o.resize((round(o.width * scale), round(o.height * scale)), Image.LANCZOS)
    o.save(out); print('strip', out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('id'); ap.add_argument('--heads', default=''); ap.add_argument('--frames', default='')
    ap.add_argument('--strip', default=''); ap.add_argument('--sheet', action='store_true'); ap.add_argument('--nopose', action='store_true')
    a = ap.parse_args()
    hs = [int(x) for x in a.heads.split(',')] if a.heads else None; fs = [int(x) for x in a.frames.split(',')] if a.frames else None
    run(a.id, hs, fs, a.nopose, a.strip or None)
