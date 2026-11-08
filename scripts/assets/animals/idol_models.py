"""T309 (#894): the farm animals' pictures through Idol (one image -> a 3D Gaussian splat, local GPU, free), and the numbers every later step reads.

The pictures are art/animals/<id>/source.png (RUN.world's image model, 2026-11-03). Idol (D:/AI/idol-batch, D:/AI/idol-venv; set IDOL_DIRS to move them)
turns each into a splat (262144 gaussians) saved as <work>/idol/<id>/<id>.ply; meta.json beside it keeps what the later steps need: the picture's
camera (yaw), the animal's long axis on the ground (axis_deg), the yaw that turns it square to the game camera (yaw_src_deg), which way round (sign),
the picture's heading (h_src: which of the 8 headings the picture shows, read off the picture), the real nose-to-tail length and the scale to the people's
art (a 1.78 m person = 190 px; the game draws at k = 0.5). Nothing else of the old 8-view sheet is kept: model.py/repair.py/rig.py/build.py make the frames.

usage: python idol_models.py [--only substring]      (the model is loaded once; ~60 s an animal)
env:   ANIMALS_WORK (default F:/ClaudeTemp/T309), IDOL_DIRS (default D:/AI/idol-test;D:/AI/idol-batch)"""
import argparse, json, math, os, sys, time
from pathlib import Path
for d in os.environ.get('IDOL_DIRS', 'D:/AI/idol-test;D:/AI/idol-batch').split(';'): sys.path.insert(0, d)
import numpy as np, torch
from PIL import Image
from render_iso import load
from render_fast import render

REPO = Path(__file__).resolve().parents[3]
WORK = Path(os.environ.get('ANIMALS_WORK', 'F:/ClaudeTemp/T309'))
SRC = REPO / 'art' / 'animals'; OUT = WORK / 'idol'
PITCH = math.radians(30); RPX = 640 / (2 * 0.62)  # render px per Idol unit (orthographic, fixed half-extent)
PX_PER_M = 190 / (1.78 * math.cos(PITCH))          # the people's art scale, ortho px per metre
NAMES = ['SE', 'S', 'SW', 'W', 'NW', 'N', 'NE', 'E']  # the headings in world-angle order, as CAR_DIRECTIONS (k 0 SE .. 7 E, the nose on screen)
# (id, the picture's heading of the 8 (read off the picture), the real nose-to-tail length in metres)
JOBS = [('cow-holstein', 0, 2.4), ('cow-brown', 2, 2.2), ('horse-bay', 0, 2.4), ('horse-chestnut', 2, 2.4), ('horse-grey', 0, 2.4),
        ('sheep-white', 2, 1.3), ('sheep-blackface', 0, 1.3)]


def _f(v):
    try: return float(v)
    except Exception: return None


def clean(xyz, cov, col, op):
    """keep the body: drop faint splats far outside the opaque splats' box (0.2th-99.8th percentiles, 5% margin); no floor-sheet cut (dark hooves)"""
    o = op.reshape(-1); body = xyz[o > 0.1]  # the legs are thin, half-transparent splats: a high cut loses them (the sheep did)
    lo, hi = torch.quantile(body, 0.002, dim=0), torch.quantile(body, 0.998, dim=0); m = (hi - lo) * 0.05
    keep = ((xyz >= lo - m) & (xyz <= hi + m)).all(1)
    return xyz[keep], cov[keep], col[keep], op[keep]


def long_axis(xyz, op):
    """the animal's long axis on the ground (radians): least-area rectangle round its torso band (35-75% of its height, above the legs)"""
    p = xyz.cpu().numpy(); o = op.cpu().numpy().reshape(-1); p = p[o > 0.2]
    z0, z1 = np.percentile(p[:, 2], [0.3, 99.7]); h = z1 - z0; band = p[(p[:, 2] > z0 + 0.35 * h) & (p[:, 2] < z0 + 0.75 * h)][:, :2]
    best = None
    for phi in np.arange(0, 90, 0.25):
        r = math.radians(phi); u = band @ np.array([math.cos(r), math.sin(r)]); v = band @ np.array([-math.sin(r), math.cos(r)])
        eu, ev = np.subtract(*np.percentile(u, [98, 2])), np.subtract(*np.percentile(v, [98, 2]))
        if best is None or eu * ev < best[0]: best = (eu * ev, r if eu >= ev else r + math.pi / 2, max(eu, ev) / min(eu, ev))
    th = best[1]; u = p[:, :2] @ np.array([math.cos(th), math.sin(th)])
    length = float(np.subtract(*np.percentile(u, [99.5, 0.5]))); height = float(h)
    return th, best[2], length, height


def diag_yaw(theta, y0):
    """the yaw nearest the picture's that turns the long axis to 45 degrees of the screen (a diagonal heading)"""
    best = None
    for dy in np.arange(-60, 60, 0.05):
        y = y0 + math.radians(dy); f = math.atan2(-math.cos(y), -math.sin(y))
        e = abs(((math.degrees(theta - f)) % 90) - 45)
        if best is None or (e, abs(dy)) < best[:2]: best = (e, abs(dy), y)
    return best[2]


def render_crop(g, yaw):
    with torch.no_grad(): im = Image.fromarray(render(*g, yaw, PITCH, 800, 0.775, 'cuda'), 'RGBA')
    return im.crop(im.getbbox() or (0, 0, im.width, im.height))


def run(pipe, iid, h_src, length_m):
    d = OUT / iid; d.mkdir(parents=True, exist_ok=True); src = SRC / iid / 'source.png'
    t0 = time.time(); meta = {}
    if (d / 'meta.json').exists(): meta = json.loads((d / 'meta.json').read_text())
    if not meta.get('idol_s'):
        o = pipe(str(src), mode='synthetic', seed=42); o.gaussian.save_ply(str(d / f'{iid}.ply'))
        meta = {'id': iid, 'source': str(src), 'camera': {k: fl for k, fl in ((k, _f(v)) for k, v in o.camera.items()) if fl is not None}, 'idol_s': round(time.time() - t0, 1)}
        (d / 'meta.json').write_text(json.dumps(meta, indent=1))
        del o; torch.cuda.empty_cache()
    xyz, cov, col, op = clean(*load(str(d / f'{iid}.ply'), 'cuda')); g = (xyz, cov, col, op)
    y0 = meta['camera']['yaw']; theta, ratio, L_u, H_u = long_axis(xyz, op); ys = diag_yaw(theta, y0)
    # which way the headings turn: the picture shows heading h_src; of the two diagonal views either side, the wider one is the one whose nose is on the right
    a, b = render_crop(g, ys + math.radians(45)), render_crop(g, ys - math.radians(45))
    plus_side = a.width > b.width; want_side = h_src in (2, 6); s = 1 if plus_side == want_side else -1
    f = PX_PER_M * length_m / (L_u * RPX)
    meta.update({'h_src': h_src, 'axis_deg': round(math.degrees(theta), 2), 'aspect': round(ratio, 2), 'yaw_src_deg': round(math.degrees(ys), 2), 'sign': s,
                 'length_m': length_m, 'height_m': round(H_u * length_m / L_u, 2), 'scale': f, 'pitch': 30})
    (d / 'meta.json').write_text(json.dumps(meta, indent=1))
    print(f'{iid}: idol {meta["idol_s"]}s, aspect {ratio:.2f}, sign {s}, height {meta["height_m"]} m', flush=True)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--only', default=''); a = ap.parse_args()
    pipe = None
    if any(not (OUT / i / f'{i}.ply').exists() for i, _, _ in JOBS if a.only in i):
        from idol import IdolPipeline
        t = time.time(); pipe = IdolPipeline.from_pretrained('speridlabs/idol', optimize=False); print(f'model loaded {time.time() - t:.0f}s', flush=True)
    for iid, h, L in JOBS:
        if a.only in iid: run(pipe, iid, h, L)


if __name__ == '__main__':
    main()
