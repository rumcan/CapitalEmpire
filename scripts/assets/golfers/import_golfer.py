"""Import a golfer's ChatGPT picture (one heading: a 3x3 sheet, cell 1 standing, cells 2-9 the walk; golfer_pack.py made the prompt) into
art/golfers/<id>/sheet.webp, in place (issue #1235; the route is docs/art/GOLFERS-CHATGPT.md).

What it does: keys the flat background (the colour of the picture's border; soft edge, the colour cast taken off the rims), finds the nine
figures (each cell's pieces of the figure, so a hand or a foot cut off by a gap stays with its body), scales all nine by one factor so the
heading's figures stand as tall as the current sheet's at that heading (the median height), puts each on the ground (its lowest pixel on the
sheet's ground line) and its body over the anchor (the middle of the chest and hips), and writes the row's 9 cells (160 x 279, anchor 80,269).
The first import of a golfer copies the old sheet to sheet-old.webp / sheet-old.json (the switch back: copy them over sheet.*).
sheet.json notes each imported heading in "chatgpt" (picture, date, scale).

usage: python import_golfer.py <picture.png> [--golfer <id> --heading <H>]   (the names come from <id>~<H>-golfers.png by default)
       [--tol 60] [--soft 40] [--scale 0.75] (force) [--dry-run] [--preview out.png]
       python import_golfer.py --all [--in D:/AI/chatgpt-bridge/in] [--golfer id]   every <id>~<H>-golfers.png there, newest last
       python import_golfer.py --contact <id> [--out contact.png]   the old and new rows of every heading side by side, plus walk.gif
"""
import argparse, datetime, json, re, shutil
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / 'art' / 'golfers'
NAME = re.compile(r'^([a-z]+_[a-z0-9_]+?)~(S|SW|W|NW|N|NE|E|SE)(?:~(golf_drive|golf_putt|pick))?-golfers\.png$')
# the grid of each picture (golfer_pack.py CLIPS): columns, rows
GRIDS = {'sheet': (3, 3), 'golf_drive': (4, 3), 'golf_putt': (4, 2), 'pick': (2, 2)}
GRASS = (104, 132, 84)


def key_out(rgb, tol, soft):
    """alpha from the distance to the border's colour (the median of a 4 px frame), and the key colour's cast taken off the soft rims"""
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.sqrt(((rgb - bg) ** 2).sum(-1))
    a = np.clip((d - tol) / soft, 0, 1)
    # un-mix the background from the rim pixels: c = a*fg + (1-a)*bg  ->  fg = (c - (1-a)*bg) / a
    am = np.maximum(a, 1e-3)[..., None]
    fg = np.clip((rgb - (1 - am) * bg) / am, 0, 255)
    out = np.where(a[..., None] > 0.999, rgb, fg)
    # despill near the edge (within 3 px of the background): the key's own channels (the high ones of bg) kept no brighter than the others,
    # so a magenta key leaves no pink rim and a green one no green rim; inside the figure nothing changes
    from PIL import ImageFilter
    near = np.asarray(Image.fromarray(((a < 0.999) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
    hi = bg > 128
    if hi.any() and (~hi).any():
        spill = np.clip(out[..., hi].min(-1) - out[..., ~hi].max(-1), 0, None) * near
        out[..., hi] -= spill[..., None]
    return out, a, bg


def components(mask):
    """4-connected pieces of a bool mask: a label image and the sizes (scipy if present, else a flood fill)"""
    try:
        from scipy import ndimage
        lab, n = ndimage.label(mask)
        return lab, np.bincount(lab.ravel())
    except ImportError:
        h, w = mask.shape; lab = np.zeros((h, w), np.int32); n = 0; sizes = [0]
        for y0 in range(h):
            for x0 in np.nonzero(mask[y0] & (lab[y0] == 0))[0]:
                if lab[y0, x0]: continue
                n += 1; st = [(y0, x0)]; lab[y0, x0] = n; c = 0
                while st:
                    y, x = st.pop(); c += 1
                    for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                        if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; st.append((yy, xx))
                sizes.append(c)
        return lab, np.array(sizes)


def figures(path, tol, soft, grid=(3, 3)):
    """the figures of a cols x rows picture (the sheet's 3x3, a clip's 4x3 or 4x2), in reading order: each an RGBA image cropped to its pieces
    (a club's thin shaft may come apart from the hands: every piece goes to the cell its middle is in)"""
    cols, rows = grid
    im = Image.open(path).convert('RGB'); rgb = np.asarray(im).astype(np.float32)
    fg, a, bg = key_out(rgb, tol, soft)
    h, w = a.shape
    lab, sizes = components(a > 0.5)
    big = (max(200, int(sizes[1:].max() * 0.004)) if grid == (3, 3) else 60) if len(sizes) > 1 else 200   # specks below this are noise
    cells = [[] for _ in range(cols * rows)]
    ys, xs = np.nonzero(lab)
    for k in range(1, len(sizes)):
        if sizes[k] < big: continue
        sel = lab == k; yy, xx = np.nonzero(sel)
        cy, cx = yy.mean(), xx.mean()
        c = min(rows - 1, int(cy / (h / rows))) * cols + min(cols - 1, int(cx / (w / cols)))
        cells[c].append(k)
    out = []
    for c, ks in enumerate(cells):
        if not ks: raise SystemExit(f'{path}: no figure in cell {c + 1}')
        sel = np.isin(lab, ks)
        # the soft rim around the pieces too (alpha below 0.5 next to them)
        from PIL import ImageFilter
        grow = np.asarray(Image.fromarray((sel * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
        alpha = np.where(grow, a, 0)
        yy, xx = np.nonzero(alpha > 0.02)
        y0, y1, x0, x1 = yy.min(), yy.max() + 1, xx.min(), xx.max() + 1
        rgba = np.dstack([fg[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).astype(np.uint8)
        out.append(Image.fromarray(rgba, 'RGBA'))
    return out, tuple(int(v) for v in bg)


def measure(im):
    """height (alpha > 0.5 rows), lowest row, and the body's middle x (the alpha mass of the middle band: chest to hips, 25%-60% down)"""
    a = np.asarray(im)[..., 3].astype(np.float32) / 255
    rows = np.nonzero((a > 0.5).any(1))[0]
    if not len(rows): return 0, 0, im.width / 2
    top, bot = rows[0], rows[-1]; hgt = bot - top + 1
    band = a[int(top + 0.25 * hgt):int(top + 0.6 * hgt) + 1]
    xs = np.arange(a.shape[1]); m = band.sum(0)
    cx = float((m * xs).sum() / m.sum()) if m.sum() else im.width / 2
    return hgt, bot, cx


def sheet_of(gid, clip='sheet'):
    j = json.loads((ART / gid / f'{clip}.json').read_text()); sheet = Image.open(ART / gid / f'{clip}.webp').convert('RGBA')
    return j, sheet


def import_clip(path, gid, heading, clip, tol=60, soft=40, scale=None, dry=False, preview=None):
    """a clip picture (golf_drive 4x3, golf_putt 4x2) into <clip>.webp's row: one scale for the row (the old and new address, takeaway
    and impact frames' heights: the club at the ground in all three), then each frame stood on its old frame's lowest pixel with its body
    over the old frame's body, so the game's timing and feet stay as they were. The first import keeps <clip>-old.webp/json"""
    base = ART / gid
    old_path = base / f'{clip}-old.webp'
    j, sheet = sheet_of(gid, clip)
    olds_sheet = Image.open(old_path).convert('RGBA') if old_path.exists() else sheet
    fw, fh = j['frameWidth'], j['frameHeight']; n = len(j['frames'])
    row = j['directions'].index(heading)
    olds = [olds_sheet.crop((c * fw, row * fh, (c + 1) * fw, (row + 1) * fh)) for c in range(n)]
    figs, bg = figures(path, tol, soft, GRIDS[clip])
    figs = figs[:n]
    probe = {'golf_drive': [9, 10, 11], 'golf_putt': [0, 7], 'pick': [0, 3]}[clip]   # (the drive's upright finish frames: ChatGPT stands the address more upright than the renders)
    k = scale or float(np.median([measure(olds[i])[0] / max(1, measure(figs[i])[0]) for i in probe]))
    # one feet line and one body x for the whole row (the feet stay planted through a stroke): the medians of the frames' lowest pixels
    # (a club head below the feet in two or three frames does not move it) and of their body middles, old and new
    scaled = [f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.LANCZOS) for f in figs]
    def mass_x(im):
        a = np.asarray(im)[..., 3].astype(np.float32); m = a.sum(0)
        return float((m * np.arange(a.shape[1])).sum() / m.sum()) if m.sum() else im.width / 2
    nm, om = [measure(s) for s in scaled], [measure(o) for o in olds]
    obot = min(float(np.median([m[1] for m in om])), fh - 4); ocx = float(np.median([mass_x(o) for o in olds]))
    cells, over = [], []
    for i, s in enumerate(scaled):
        # each frame's own feet: its lowest pixel unless that is a club head well below the row's feet (then the row's median)
        nb = float(np.median([m[1] for m in nm])); bot = nm[i][1] if nm[i][1] <= nb + 6 else nb
        cx = mass_x(s)   # (each frame's own crop: its body's middle over the row's)
        c = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
        x, y = round(ocx - cx), round(obot - bot)
        c.paste(s, (x, y), s)
        if x < 0 or y < 0 or x + s.width > fw or y + s.height > fh: over.append(i)
        cells.append(c)
    note = f'{path.name}: {gid} {heading} {clip} key {bg}, scale {k:.3f}' + (f', cut at the cell edge: frames {over}' if over else '')
    print(note)
    if preview:
        pv = Image.new('RGBA', (fw * n, fh * 2), GRASS + (255,))
        for c in range(n): pv.alpha_composite(olds[c], (c * fw, 0)); pv.alpha_composite(cells[c], (c * fw, fh))
        pv.convert('RGB').save(preview)
    if dry: return note
    if not old_path.exists():
        shutil.copyfile(base / f'{clip}.webp', old_path); shutil.copyfile(base / f'{clip}.json', base / f'{clip}-old.json')
    for c in range(n):
        sheet.paste(Image.new('RGBA', (fw, fh), (0, 0, 0, 0)), (c * fw, row * fh)); sheet.paste(cells[c], (c * fw, row * fh))
    sheet.save(base / f'{clip}.webp', quality=90, alpha_quality=100, method=6)
    ch = j.setdefault('chatgpt', {})
    ch[heading] = {'picture': path.name, 'date': datetime.date.today().isoformat(), 'scale': round(k, 4)}
    if len(ch) == 8: j['name'] = f'{gid} {clip} (ChatGPT painted)'
    (base / f'{clip}.json').write_text(json.dumps(j, indent=2) + '\n')
    return note


def cell(sheet, j, row, col):
    fw, fh = j['frameWidth'], j['frameHeight']
    return sheet.crop((col * fw, row * fh, (col + 1) * fw, (row + 1) * fh))


def import_one(path, gid, heading, tol=60, soft=40, scale=None, dry=False, preview=None):
    j, sheet = sheet_of(gid)
    fw, fh, ax, ay = j['frameWidth'], j['frameHeight'], j['anchor']['x'], j['anchor']['y']
    row = j['directions'].index(heading)
    olds = [cell(sheet, j, row, c) for c in range(len(j['frames']))]
    old_h = np.median([measure(o)[0] for o in olds]); ground = min(int(np.median([measure(o)[1] for o in olds])), fh - 4)   # (the old renders' soles were cut at the cell's last row: keep the new ones 3 px inside)
    figs, bg = figures(path, tol, soft)
    new_h = np.median([measure(f)[0] for f in figs])
    k = scale or old_h / new_h
    cells, over = [], []
    for i, f in enumerate(figs):
        s = f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.LANCZOS)
        _, bot, cx = measure(s)
        c = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
        x, y = round(ax - cx), round(ground - bot)
        c.alpha_composite(s, (x, y)) if 0 <= x and 0 <= y and x + s.width <= fw and y + s.height <= fh else c.paste(s, (x, y), s)
        if x < 0 or y < 0 or x + s.width > fw or y + s.height > fh: over.append(i)
        cells.append(c)
    note = f'{path.name}: {gid} {heading} key {bg}, scale {k:.3f} (old figure {old_h:.0f} px, new {new_h * k:.0f})' + (f', cut at the cell edge: frames {over}' if over else '')
    print(note)
    if preview:
        pv = Image.new('RGBA', (fw * 9, fh * 2), GRASS + (255,))
        for c in range(9): pv.alpha_composite(olds[c], (c * fw, 0)); pv.alpha_composite(cells[c], (c * fw, fh))
        pv.convert('RGB').save(preview)
    if dry: return note
    base = ART / gid
    if not (base / 'sheet-old.webp').exists():
        shutil.copyfile(base / 'sheet.webp', base / 'sheet-old.webp'); shutil.copyfile(base / 'sheet.json', base / 'sheet-old.json')
    for c in range(9):
        sheet.paste(Image.new('RGBA', (fw, fh), (0, 0, 0, 0)), (c * fw, row * fh)); sheet.paste(cells[c], (c * fw, row * fh))
    sheet.save(base / 'sheet.webp', quality=90, alpha_quality=100, method=6)   # (lossy colour, exact alpha: about the old sheet's size)
    ch = j.setdefault('chatgpt', {})
    ch[heading] = {'picture': path.name, 'date': datetime.date.today().isoformat(), 'scale': round(k, 4)}
    j['clips']['walk'] = j['clips'].get('walk', '') if len(ch) < 8 else 'ChatGPT painted walk (8 frames, issue #1235)'
    if len(ch) == 8: j['clips']['idle'] = 'ChatGPT painted standing pose (issue #1235)'; j['name'] = f'{gid} (ChatGPT painted)'
    (base / 'sheet.json').write_text(json.dumps(j, indent=2) + '\n')
    return note


def contact(gid, out, clip='sheet'):
    """old (top) and new (below) rows of every heading on grass, and an animated clip of all eight headings (<out>-walk.gif)"""
    j, sheet = sheet_of(gid, clip)
    old = Image.open(ART / gid / f'{clip}-old.webp').convert('RGBA') if (ART / gid / f'{clip}-old.webp').exists() else sheet
    fw, fh = j['frameWidth'], j['frameHeight']; n = len(j['frames'])
    pv = Image.new('RGBA', (fw * n + 40, fh * 16), GRASS + (255,))
    from PIL import ImageDraw
    d = ImageDraw.Draw(pv)
    for r, h in enumerate(j['directions']):
        for c in range(n):
            pv.alpha_composite(cell(old, j, r, c), (40 + c * fw, 2 * r * fh)); pv.alpha_composite(cell(sheet, j, r, c), (40 + c * fw, (2 * r + 1) * fh))
        d.text((4, 2 * r * fh + 8), h + '\nold', fill=(255, 255, 255)); d.text((4, (2 * r + 1) * fh + 8), h + '\nnew', fill=(255, 255, 0))
    pv.convert('RGB').save(out)
    gif = []
    for f in (list(range(1, n)) + [0] * 3 if clip == 'sheet' else list(range(n)) + [n - 1] * 4):
        g = Image.new('RGBA', (fw * 8, fh), GRASS + (255,))
        for r in range(8): g.alpha_composite(cell(sheet, j, r, f), (r * fw, 0))
        gif.append(g.convert('RGB'))
    gp = Path(out).with_name(Path(out).stem + '-walk.gif')
    if clip == 'sheet': dur = [int(1000 / j.get('walkFps', 6))] * (n - 1) + [500] * 3
    else: t = j['times']; dur = [max(40, int(1000 * (t[i + 1] - t[i]))) for i in range(n - 1)] + [400] + [300] * 4
    gif[0].save(gp, save_all=True, append_images=gif[1:], duration=dur, loop=0)
    print(out, gp)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('picture', nargs='?'); ap.add_argument('--golfer'); ap.add_argument('--heading')
    ap.add_argument('--tol', type=float, default=60); ap.add_argument('--soft', type=float, default=40); ap.add_argument('--scale', type=float)
    ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--preview')
    ap.add_argument('--all', action='store_true'); ap.add_argument('--in', dest='inp', default='D:/AI/chatgpt-bridge/in')
    ap.add_argument('--family', default='golfers', help='golfers or spectators (the staff)')
    ap.add_argument('--contact'); ap.add_argument('--out'); ap.add_argument('--clip', default='sheet', choices=list(GRIDS))
    a = ap.parse_args()
    global ART
    ART = ROOT / 'art' / a.family
    if a.contact: return contact(a.contact, a.out or f'{a.contact}-{a.clip}-contact.png', a.clip)
    if a.all:
        for p in sorted(Path(a.inp).glob('*~*-golfers.png'), key=lambda p: p.stat().st_mtime):
            m = NAME.match(p.name)
            if m and (not a.golfer or m.group(1) == a.golfer) and (m.group(3) or 'sheet') == a.clip:
                if a.clip == 'sheet': import_one(p, m.group(1), m.group(2), a.tol, a.soft, a.scale, a.dry_run)
                else: import_clip(p, m.group(1), m.group(2), a.clip, a.tol, a.soft, a.scale, a.dry_run)
        return
    p = Path(a.picture); m = NAME.match(p.name)
    gid, h = a.golfer or (m and m.group(1)), a.heading or (m and m.group(2))
    if not gid or not h: raise SystemExit('name the golfer and heading (--golfer, --heading) or use <id>~<H>-golfers.png')
    clip = (m and m.group(3)) or a.clip
    if clip == 'sheet': import_one(p, gid, h, a.tol, a.soft, a.scale, a.dry_run, a.preview)
    else: import_clip(p, gid, h, clip, a.tol, a.soft, a.scale, a.dry_run, a.preview)


if __name__ == '__main__':
    main()
