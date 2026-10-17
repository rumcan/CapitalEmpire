"""Bundle the Maple Falls town builder's ground art (branch town/builder-in-repo, art/town-ground/) for the game:
asphalt paintings (flattened like scripts/lib/town-scene.mjs does), curb strips, sidewalk slabs, the lamp pool stamp,
a leaf-sprite atlas and the two grass bases. Writes src/assets/ground/ and src/game/ground-art.ts."""
import json, os, subprocess, struct, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src/assets/ground')
TMP = '/tmp/tb/art'
BASE = 'https://raw.githubusercontent.com/rumcan/TrickOrTreat/town/builder-in-repo/art/town-ground'
os.makedirs(OUT, exist_ok=True); os.makedirs(os.path.join(TMP, 'slabs'), exist_ok=True); os.makedirs(os.path.join(TMP, 'leaves'), exist_ok=True)

def fetch(rel, dst):
    if not os.path.exists(dst):
        subprocess.run(['curl', '-sL', '-o', dst, f'{BASE}/{rel}'], check=True)
    return dst

# ---------------------------------------------------------------- PNG I/O without PIL
def read_png(path):
    """returns (w, h, rgba bytes); handles 8-bit RGB/RGBA/grey(+alpha) via ImageMagick conversion to RGBA32 PNG"""
    tmp = path + '.rgba.png'
    subprocess.run(['convert', path, '-depth', '8', 'PNG32:' + tmp], check=True)
    data = open(tmp, 'rb').read(); os.remove(tmp)
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos = 8; idat = b''; w = h = 0
    while pos < len(data):
        ln, typ = struct.unpack('>I4s', data[pos:pos + 8]); body = data[pos + 8:pos + 8 + ln]; pos += 12 + ln
        if typ == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', body[:10]); assert bd == 8 and ct == 6, (bd, ct)
        elif typ == b'IDAT': idat += body
    raw = zlib.decompress(idat); stride = w * 4; out = bytearray(w * h * 4); prev = bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]; line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - 4] if i >= 4 else 0; b = prev[i]; c = prev[i - 4] if i >= 4 else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out[y * stride:(y + 1) * stride] = line; prev = line
    return w, h, out

def write_png(path, w, h, rgba):
    stride = w * 4; raw = b''.join(b'\x00' + bytes(rgba[y * stride:(y + 1) * stride]) for y in range(h))
    def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

# ---------------------------------------------------------------- asphalt: flatten(img, 22) + shared mean (town-scene.mjs loadSources)
def flatten(w, h, px, r):
    ch = [[float(px[(y * w + x) * 4 + k]) for y in range(h) for x in range(w)] for k in range(3)]
    def blur(a):
        t = [0.0] * (w * h)
        for it in range(3):
            for y in range(h):
                s = sum(a[y * w + min(max(x, 0), w - 1)] for x in range(-r, r + 1))
                for x in range(w):
                    t[y * w + x] = s / (2 * r + 1); s += a[y * w + min(w - 1, x + r + 1)] - a[y * w + max(0, x - r)]
            for x in range(w):
                s = sum(t[min(max(y, 0), h - 1) * w + x] for y in range(-r, r + 1))
                for y in range(h):
                    a[y * w + x] = s / (2 * r + 1); s += t[min(h - 1, y + r + 1) * w + x] - t[max(0, y - r) * w + x]
        return a
    mean = [sum(a) / len(a) for a in ch]
    for k in range(3):
        lo = blur(list(ch[k]))
        for i in range(w * h): ch[k][i] = ch[k][i] - lo[i] + mean[k]
    return ch, mean

asph = []
for name in ['asphalt-a.png', 'asphalt-b.png']:
    w, h, px = read_png(fetch(f'roads/{name}', os.path.join(TMP, name)))
    ch, mean = flatten(w, h, px, 22); asph.append((name, w, h, ch, mean))
tw = sum(a[1] for a in asph)
shared = [sum(a[4][k] * a[1] for a in asph) / tw for k in range(3)]
for name, w, h, ch, mean in asph:
    out = bytearray(w * h * 4)
    for i in range(w * h):
        for k in range(3): out[i * 4 + k] = max(0, min(255, round(ch[k][i] - mean[k] + shared[k])))
        out[i * 4 + 3] = 255
    write_png(os.path.join(TMP, 'flat-' + name), w, h, out)
    subprocess.run(['convert', os.path.join(TMP, 'flat-' + name), '-quality', '93', '-define', 'webp:method=6', os.path.join(OUT, name.replace('.png', '.webp'))], check=True)
print('asphalt mean', [round(v, 1) for v in shared])

# ---------------------------------------------------------------- curbs, slabs, pool stamp: copied as they are
for rel in ['roads/curb-visible.png', 'roads/curb-hidden.png', 'roads/pool-straight-intensity.png']:
    src = fetch(rel, os.path.join(TMP, os.path.basename(rel))); subprocess.run(['cp', src, os.path.join(OUT, os.path.basename(rel))], check=True)
slabs = [f'top-{i}' for i in range(4)] + [f'bottom-{i}' for i in range(7)]
cells = []
for s in slabs:
    src = fetch(f'roads/slabs/{s}.png', os.path.join(TMP, 'slabs', s + '.png')); cells.append(src)
# one strip: every slab stretched to 144 x 100 (the renderer stretches them to the slab rectangle anyway)
subprocess.run(['convert', *[arg for c in cells for arg in ['(', c, '-resize', '144x100!', ')']], '+append', '-quality', '92', '-define', 'webp:method=6', os.path.join(OUT, 'slabs.webp')], check=True)

# ---------------------------------------------------------------- grass bases at the approved 256 px screen repeat
for name in ['grass-base.png', 'grass-v2-base.png']:
    src = fetch(f'terrain/{name}', os.path.join(TMP, name))
    subprocess.run(['convert', src, '-filter', 'Lanczos', '-resize', '256x256!', '-quality', '92', os.path.join(OUT, name.replace('.png', '.webp'))], check=True)

# ---------------------------------------------------------------- leaves: the builder's sprites, filtered like loadSources, packed into an atlas
meta = json.load(open(fetch('roads/leaves.json', os.path.join(TMP, 'leaves.json'))))
cands = []
for l in meta:
    if max(l['width'], l['height']) < 14: continue
    cands.append(l)
# a spread of sizes from each pool, deterministic
import random
rnd = random.Random(7)
by = {'tiny': [], 'orange': [], 'yellow': []}
for l in cands: by[l['source']].append(l)
pick = []
for src_name, n in [('tiny', 26), ('orange', 22), ('yellow', 24)]:
    lst = sorted(by[src_name], key=lambda l: max(l['width'], l['height']))
    step = max(1, len(lst) // n)
    pick += [lst[min(len(lst) - 1, i * step + rnd.randrange(step))] for i in range(n)]
CELL = 40; kept = []
for l in pick:
    src = fetch(f"roads/leaves/{l['file']}", os.path.join(TMP, 'leaves', l['file']))
    w, h, px = read_png(src)
    n = green = r = g = 0
    for i in range(w * h):
        if px[i * 4 + 3] < 150: continue
        n += 1; r += px[i * 4]; g += px[i * 4 + 1]
        if px[i * 4 + 1] > px[i * 4] * .95: green += 1
    if not n or green / n >= .12 or (r - g) / n < 58: continue
    kept.append((l, src))
cols = 12; rows = (len(kept) + cols - 1) // cols
args = ['convert', '-size', f'{cols * CELL}x{rows * CELL}', 'xc:none']
for i, (l, src) in enumerate(kept):
    x, y = (i % cols) * CELL, (i // cols) * CELL
    args += ['(', src, '-resize', f'{CELL - 2}x{CELL - 2}', ')', '-geometry', f'+{x + 1}+{y + 1}', '-composite']
args += ['-quality', '92', '-define', 'webp:method=6', os.path.join(OUT, 'leaves.webp')]
subprocess.run(args, check=True)
leafmeta = [{'i': i, 'dim': max(l['width'], l['height']), 'round': l['source'] == 'tiny'} for i, (l, _) in enumerate(kept)]

ts = f"""// Generated by scripts/prep-ground.py from the town builder's art (rumcan/TrickOrTreat@town/builder-in-repo, art/town-ground).
import asphaltA from '../assets/ground/asphalt-a.webp';
import asphaltB from '../assets/ground/asphalt-b.webp';
import curbVisible from '../assets/ground/curb-visible.png';
import curbHidden from '../assets/ground/curb-hidden.png';
import pool from '../assets/ground/pool-straight-intensity.png';
import slabs from '../assets/ground/slabs.webp';
import grassA from '../assets/ground/grass-base.webp';
import grassB from '../assets/ground/grass-v2-base.webp';
import leaves from '../assets/ground/leaves.webp';

export const GROUND_ART = {{ asphaltA, asphaltB, curbVisible, curbHidden, pool, slabs, grassA, grassB, leaves }};
/** painted px per metre of the road kit (manifest.json pxPerM) */
export const PPM = 55.2;
export const ASPHALT_MEAN: [number, number, number] = [{shared[0]:.2f}, {shared[1]:.2f}, {shared[2]:.2f}];
export const SLAB_COUNT = {len(slabs)};
export const SLAB_TOP = 4;
export const SLAB_CELL: [number, number] = [144, 100];
export const LEAF_CELL = {CELL};
export const LEAF_COLS = {cols};
/** dim = the sprite's native size in px at {55.2:.1f} px/m; round = the small round 'tiny' pool */
export const LEAVES: {{ i: number; dim: number; round: boolean }}[] = {json.dumps(leafmeta, separators=(',', ':'))};
/** the manifest's pool stamp anchor: lampU (px along), curbRow (px across) */
export const POOL_ANCHOR: [number, number] = [190, 20.5];
"""
open(os.path.join(ROOT, 'src/game/ground-art.ts'), 'w').write(ts)
print('leaves kept', len(kept), 'atlas', cols, 'x', rows)
