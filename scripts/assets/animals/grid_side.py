"""side views (model frame: u forward to the right, z up from the hooves) of every animal's aligned rest pose with a labelled grid and the rig's joints
(rig.JOINTS: the neck's base J0 and its cut, the poll J2, the muzzle M), to read joint positions off and to check them.
usage: python grid_side.py [ids comma] [--repaired]      -> <work>/grid-<id>.png"""
import math, os, sys
from pathlib import Path
from common import *
from model import load_aligned
from rig import JOINTS
from PIL import ImageDraw, ImageFont

args = [a for a in sys.argv[1:] if not a.startswith('--')]
ids = args[0].split(',') if args else ['cow-holstein', 'cow-brown', 'horse-bay', 'horse-chestnut', 'horse-grey', 'sheep-white', 'sheep-blackface']
WORK = Path(os.environ.get('ANIMALS_WORK', 'F:/ClaudeTemp/T309'))
S = 1000; HALF = 0.7; CZ = 0.40  # px, half width (model units), centre height
font = ImageFont.load_default()
for iid in ids:
    M = load_aligned(iid)
    if '--repaired' in sys.argv:
        from repair import repair
        M = repair(M)
    rgb, a = render_cam(M.p, M.cov, M.col, M.op, vec(1, 0, 0), vec(0, 0, 1), S, HALF, center=(0., CZ))
    im = Image.new('RGB', (S, S), (200, 205, 195)); fg = to_img(rgb, a); im.paste(fg, (0, 0), fg)
    d = ImageDraw.Draw(im); px = 2 * HALF / S
    X = lambda u: (u + HALF) / px; Y = lambda z: (HALF - (z - CZ)) / px
    for k in range(-7, 8):
        u = k * 0.1; d.line([(X(u), 0), (X(u), S)], fill=(0, 0, 0) if k == 0 else (90, 90, 160), width=1); d.text((X(u) + 2, 2), f'{u:.1f}', fill=(0, 0, 120), font=font)
    for k in range(-3, 12):
        z = k * 0.1; d.line([(0, Y(z)), (S, Y(z))], fill=(0, 0, 0) if k == 0 else (90, 90, 160), width=1); d.text((2, Y(z) + 1), f'{z:.1f}', fill=(0, 0, 120), font=font)
    J = JOINTS.get(iid)
    if J:
        for name, (u, z), col in (('J0', J['J0'], (255, 0, 0)), ('J2', J['J2'], (255, 0, 0)), ('M', J['M'], (255, 0, 255))):
            d.ellipse([X(u) - 5, Y(z) - 5, X(u) + 5, Y(z) + 5], outline=col, width=2); d.text((X(u) + 7, Y(z) - 5), name, fill=col, font=font)
        a0 = math.radians(J['a0']); u0, z0 = J['J0']  # the base cut: a line through J0 perpendicular to its normal
        d.line([(X(u0 - 0.2 * math.sin(a0)), Y(z0 + 0.2 * math.cos(a0))), (X(u0 + 0.2 * math.sin(a0)), Y(z0 - 0.2 * math.cos(a0)))], fill=(255, 0, 0), width=2)
        if 'belly' in J: d.line([(0, Y(J['belly'])), (S, Y(J['belly']))], fill=(255, 128, 0), width=1)
    d.text((10, S - 14), f'{iid}  L {M.L:.3f} h {M.h:.3f}', fill=(0, 0, 0), font=font)
    out = WORK / f'grid-{iid}.png'; im.save(out); print('saved', out, flush=True)
    del M; torch.cuda.empty_cache()
