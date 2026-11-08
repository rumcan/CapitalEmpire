"""T309 (#894): put frames made outside Idol into an animal's sheet: one clip, one heading.
The owner, 2026-11-08: "farm animals must go to the chatgpt AI to generate the animations". The Idol frames in art/animals are placeholders; ChatGPT's
clips (a GIF, or a strip of frames) come back through this script. Nothing else changes: scripts/assets/prep-animals.mjs packs the sheet as before.

THE SHEET (art/animals/<id>/sheet.webp + sheet.json), what prep-animals.mjs reads and what this script keeps:
  rows    the 8 headings in world-angle order (CAR_DIRECTIONS): SE S SW W NW N NE E (the nose on screen: SE is down-right), never mirrored
  columns the 15 frames of a heading: graze 0-3 (4, loops), lookup 4-6 (3, the head coming up; the game plays it backwards to put the head down),
          walk 7-14 (8, loops); sheet.json "clips" holds each clip's start, n, times, loop
  cells   every cell frameWidth x frameHeight px at the ART scale (a 1.78 m person = 190 px; the game draws at k = 0.5), transparent background,
          the animal's middle on the ground at sheet.json "anchor" (x, y in the cell), the sun at the upper right (lit in the picture)
  so a new clip for one heading is: n frames, keyed, scaled to the animal's size, the same ground point in every cell. (To change the frame count of a
  clip, the sheet's columns and the engine's frame table change together: ANIMAL_GRAZE/LOOKUP/WALK/ROW in src/game/ext/farms/animals.ts.)

WHAT IT DOES: loads the GIF (every frame) or the strip (one picture of N cells left to right; --grid RxC for a grid, read row by row); picks N frames if
there are more (evenly through the loop; a last frame that repeats the first is dropped; for look-up the first and the last kept); keys out the flat
background (its colour from the border, or --bg; only the background connected to the border goes, so a grey coat inside stays, and small enclosed gaps
between the legs go too; the edge is unmixed from the background colour; --cut-shadow also takes a soft grey ground shadow off the feet); keeps the
biggest piece; scales ALL the frames by one factor so the animal's BODY matches the placeholder's (the opaque area, median over the clip, so a head
held lower or a leg swung further does not change it; --scale-by box matches the union box instead; --scale s forces it: use the walk's scale for the
other clips of the same heading so the animal does not change size when it stops to graze); stands it on the placeholder's ground: its mass
centre (median over the clip) on the placeholder's, its lowest hoof (median) on the placeholder's, and with the ground lock (on) every frame's lowest
hoof on the clip's median (a bounce of a few percent goes); writes the cells of that heading and clip and marks them in sheet.json
("imported": {clip: [headings]}, "art": "mixed" or "chatgpt").

NO MIRRORING: the sun is at the upper right and a sprite is lit, so a heading is never made by turning another one over (the owner's rule). Each of the 8
headings of a clip is its own picture from ChatGPT. There is no mirror option on purpose.

usage:  python import_frames.py <clip.gif|strip.png> --animal cow-brown --clip walk --heading SE
          [--grid RxC] [--bg r,g,b] [--tol 30] [--cut-shadow] [--scale-by area|box] [--scale s] [--no-ground-lock] [--preview out.png]
          [--dry-run] [--out-sheet dir]
  --dry-run writes nothing but the preview; --out-sheet dir writes sheet.webp/json there instead of art/animals/<animal>/ (to try a clip first).
  Then pack it: node scripts/assets/prep-animals.mjs (through bash E:/ClaudeTemp/heavy.sh). The preview shows the placeholder on top, the new clip below."""
import argparse, json, math, sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops, ImageFilter, ImageSequence

REPO = Path(__file__).resolve().parents[3]
DIRS = ['SE', 'S', 'SW', 'W', 'NW', 'N', 'NE', 'E']
BG_PREVIEW = (122, 148, 92)


# ------------------------------------------------------------------ loading
def load_frames(path, n, grid=None):
    """the frames of a GIF (or any animated picture) or the cells of a strip/grid, as RGB PIL images"""
    im = Image.open(path)
    if getattr(im, 'is_animated', False) and getattr(im, 'n_frames', 1) > 1:
        out = []
        for fr in ImageSequence.Iterator(im):
            rgba = fr.convert('RGBA'); flat = Image.new('RGBA', rgba.size, (255, 255, 255, 255)); flat.alpha_composite(rgba); out.append(flat.convert('RGB'))
        return out, 'gif'
    im = im.convert('RGB'); W, H = im.size
    r, c = grid if grid else ((1, n) if W >= H else (n, 1))
    cw, ch = W // c, H // r
    return [im.crop((x * cw, y * ch, x * cw + cw, y * ch + ch)) for y in range(r) for x in range(c)], f'strip {r}x{c}'


def pick(frames, n, loop):
    """n of the frames, evenly: a loop does not repeat its first frame at the end (a last frame equal to the first is dropped); a clip that is not a
    loop keeps its first and its last"""
    if loop and len(frames) > n:
        f0, f1 = (np.asarray(f.resize((64, 64), Image.BOX), np.float32) for f in (frames[0], frames[-1]))
        if float(np.abs(f0 - f1).mean()) < 2.0: frames = frames[:-1]; print('  the last frame repeats the first: dropped')
    N = len(frames)
    if N == n: return frames
    if N < n: print(f'  warning: only {N} frames for {n}: some repeat')
    idx = [int(round(i * N / n)) % N for i in range(n)] if loop else [int(round(i * (N - 1) / max(1, n - 1))) for i in range(n)]
    return [frames[i] for i in idx]


# ------------------------------------------------------------------ keying
def border_colour(frames, ring=0.03):
    """the background colour: the median of the outer ring of every frame"""
    px = []
    for f in frames:
        a = np.asarray(f); h, w = a.shape[:2]; t = max(2, int(min(h, w) * ring))
        px.append(np.concatenate([a[:t].reshape(-1, 3), a[-t:].reshape(-1, 3), a[:, :t].reshape(-1, 3), a[:, -t:].reshape(-1, 3)]))
    return np.median(np.concatenate(px), axis=0)


def connected_to_border(cand):
    """the part of the boolean mask `cand` connected to the picture's border (grown by 5x5 maxima, held to the mask, until it stops)"""
    c = Image.fromarray((cand * 255).astype(np.uint8), 'L'); h, w = cand.shape
    seed = np.zeros_like(cand); seed[0, :] = seed[-1, :] = True; seed[:, 0] = seed[:, -1] = True
    cur = Image.fromarray(((seed & cand) * 255).astype(np.uint8), 'L')
    for _ in range(max(h, w)):
        nxt = ImageChops.multiply(cur.filter(ImageFilter.MaxFilter(5)), c)
        if ImageChops.difference(nxt, cur).getbbox() is None: break
        cur = nxt
    return np.asarray(cur) > 0


def components(mask):
    """the 8-connected components of a boolean mask, as lists of (y, x)"""
    ys, xs = np.nonzero(mask); todo = set(zip(ys.tolist(), xs.tolist())); out = []
    while todo:
        seed = todo.pop(); comp = [seed]; q = deque([seed])
        while q:
            cy, cx = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                nb = (cy + dy, cx + dx)
                if nb in todo: todo.discard(nb); comp.append(nb); q.append(nb)
        out.append(comp)
    return out


def key_frame(frame, bg, tol, cut_shadow=False):
    """RGBA of a frame with its flat background removed: pixels within tol of the background that touch the border go (a soft edge up to 2.2 tol), small
    enclosed gaps of the background's colour go too (between the legs), the edge colour is unmixed from the background"""
    a = np.asarray(frame).astype(np.float32); d = np.sqrt(((a - bg[None, None]) ** 2).sum(-1))
    lo, hi = tol, tol * 2.2
    bgm = connected_to_border(d < hi)
    holes = (d < lo) & ~bgm
    if holes.any():
        limit = max(40, int(0.003 * d.shape[0] * d.shape[1]))
        for comp in components(holes):
            if len(comp) <= limit:
                for (cy, cx) in comp: bgm[cy, cx] = True
    alpha = np.where(bgm, np.clip((d - lo) / (hi - lo), 0, 1), 1.0).astype(np.float32)
    alpha = np.where(alpha < 0.12, 0.0, alpha)  # (the faintest fringe goes: unmixing it would only amplify the picture's noise)
    al = np.maximum(alpha, 1e-3)[..., None]; col = np.where((alpha < 1)[..., None], (a - (1 - al) * bg[None, None]) / al, a)
    if cut_shadow:
        # a soft ground shadow: neutral (grey, no colour), darker than the background but not black, in the lowest part of the animal
        ys = np.nonzero((alpha > 0.5).any(1))[0]
        if len(ys):
            y1 = ys.max(); band = np.zeros_like(alpha, dtype=bool); band[int(y1 - 0.25 * (y1 - ys.min())):] = True
            chroma = a.max(-1) - a.min(-1); lum = a.mean(-1); bl = float(bg.mean())
            sh = band & (chroma < 16) & (lum < bl - 4) & (lum > 0.40 * bl) & (alpha > 0)
            alpha = np.where(sh, 0.0, alpha)
    out = np.dstack([np.clip(col, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def keep_biggest(im, thr=24):
    """drop every piece of the picture but the biggest (a ground patch, a speck, a sliver of shadow): the pieces are found on a quarter-size mask taken
    with a max filter (a thin leg stays whole), the biggest kept with a margin, the rest of the alpha cleared"""
    a = np.asarray(im)[..., 3]; h, w = a.shape; s = 4
    m = Image.fromarray((a > thr).astype(np.uint8) * 255, 'L').filter(ImageFilter.MaxFilter(3))
    small = np.asarray(m.resize((max(1, w // s), max(1, h // s)), Image.BOX)) > 50
    comps = components(small)
    if len(comps) <= 1: return im
    big = max(comps, key=len); lab = np.zeros(small.shape, np.uint8)
    for (cy, cx) in big: lab[cy, cx] = 255
    keep = np.asarray(Image.fromarray(lab, 'L').resize((w, h), Image.NEAREST).filter(ImageFilter.MaxFilter(s + 1))) > 0
    arr = np.asarray(im).copy(); arr[..., 3] = np.where(keep, arr[..., 3], 0); return Image.fromarray(arr, 'RGBA')


def bbox(im, thr=8):
    return Image.fromarray((np.asarray(im)[..., 3] > thr).astype(np.uint8) * 255, 'L').getbbox()


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def stats(ims, thr=8):
    """per frame: the opaque area, the mass centre x and the lowest opaque row; and the clip's medians (area, centre x, bottom)"""
    rows = []
    for im in ims:
        al = np.asarray(im)[..., 3] > thr; ys, xs = np.nonzero(al)
        rows.append((float(al.sum()), float(xs.mean()), float(ys.max())))
    r = np.array(rows); return r, tuple(float(np.median(r[:, i])) for i in range(3))


# ------------------------------------------------------------------ the sheet
def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src'); ap.add_argument('--animal', required=True); ap.add_argument('--clip', required=True, choices=['graze', 'lookup', 'walk'])
    ap.add_argument('--heading', required=True, choices=DIRS); ap.add_argument('--grid', default='')
    ap.add_argument('--bg', default=''); ap.add_argument('--tol', type=float, default=30.0); ap.add_argument('--scale', type=float, default=0.0)
    ap.add_argument('--scale-by', default='area', choices=['area', 'box']); ap.add_argument('--cut-shadow', action='store_true')
    ap.add_argument('--no-ground-lock', action='store_true'); ap.add_argument('--preview', default=''); ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--out-sheet', default=''); ap.add_argument('--mirror-from', default='')
    a = ap.parse_args()
    if a.mirror_from:
        sys.exit('no: a heading is never made by mirroring another (the sun is at the upper right and the sprite is lit). Each heading is its own clip.')
    art = REPO / 'art' / 'animals' / a.animal; js = json.loads((art / 'sheet.json').read_text(encoding='utf-8'))
    if js['directions'] != DIRS: sys.exit(f'the sheet\'s rows are {js["directions"]}, expected {DIRS}')
    FW, FH, AX, AY = js['frameWidth'], js['frameHeight'], js['anchor']['x'], js['anchor']['y']
    clip = js['clips'][a.clip]; n, start, loop = clip['n'], clip['start'], clip['loop']; row = DIRS.index(a.heading)
    sheet = Image.open(art / 'sheet.webp').convert('RGBA')

    frames, how = load_frames(a.src, n, tuple(int(v) for v in a.grid.lower().split('x')) if a.grid else None)
    print(f'{a.src}: {len(frames)} frames ({how}), the clip wants {n}')
    frames = pick(frames, n, loop)
    bg = np.array([float(v) for v in a.bg.split(',')]) if a.bg else border_colour(frames)
    print(f'background {tuple(int(v) for v in bg)}, tolerance {a.tol}')
    keyed = [keep_biggest(key_frame(f, bg, a.tol, a.cut_shadow)) for f in frames]
    boxes = [bbox(k) for k in keyed]
    if any(b is None for b in boxes): sys.exit('a frame is empty after keying: check --bg and --tol')
    ub = union(boxes); Wi, Hi = ub[2] - ub[0], ub[3] - ub[1]

    # the placeholder's cells for this clip and heading: its body, its mass centre, its ground
    old = [sheet.crop(((start + i) * FW, row * FH, (start + i) * FW + FW, row * FH + FH)) for i in range(n)]
    ob = [bbox(c) for c in old if bbox(c)]
    if not ob: sys.exit('the placeholder cells are empty: nothing to size against; give --scale')
    uo = union(ob); Wp, Hp = uo[2] - uo[0], uo[3] - uo[1]
    _, (A_old, cx_old, bot_old) = stats(old); _, (A_new, cx_new, bot_new) = stats(keyed)
    s_area, s_box = math.sqrt(A_old / A_new), math.sqrt((Wp / Wi) * (Hp / Hi))
    s = a.scale or (s_area if a.scale_by == 'area' else s_box)
    print(f'size: body area ratio -> scale {s_area:.3f}; union box {Wi}x{Hi} against the placeholder\'s {Wp}x{Hp} -> scale {s_box:.3f}; using {s:.3f}' + (' (forced)' if a.scale else ''))
    if max(s_area, s_box) / min(s_area, s_box) > 1.15: print('  (the two measures differ by more than 15%: the poses or the proportions differ; look at the preview)')

    # scale, then stand it on the placeholder's ground: the mass centre and the lowest hoof (medians) on the placeholder's; the ground lock after
    scaled = [k.resize((max(1, round(k.width * s)), max(1, round(k.height * s))), Image.LANCZOS) for k in keyed]
    rows, (A_s, cx_s, bot_s) = stats(scaled)
    ox, oy = int(round(cx_old - cx_s)), int(round(bot_old - bot_s))
    bottoms = rows[:, 2]; med = float(np.median(bottoms))
    lock = [0 if a.no_ground_lock else int(round(max(-0.06 * Hp, min(0.06 * Hp, med - b)))) for b in bottoms]
    if not a.no_ground_lock: print(f'ground lock: the lowest hoof bounced {int(bottoms.max() - bottoms.min())} px, lined up (shifts {lock})')
    cells, lost = [], 0
    for k, dy in zip(scaled, lock):
        cell = Image.new('RGBA', (FW, FH), (0, 0, 0, 0)); x0, y0 = ox, oy + dy
        sx0, sy0, sx1, sy1 = max(0, -x0), max(0, -y0), min(k.width, FW - x0), min(k.height, FH - y0)
        if sx1 > sx0 and sy1 > sy0: cell.alpha_composite(k.crop((sx0, sy0, sx1, sy1)), (x0 + sx0, y0 + sy0))
        b = bbox(k)
        if b[0] + x0 < 0 or b[1] + y0 < 0 or b[2] + x0 > FW or b[3] + y0 > FH: lost += 1  # (the animal, not the picture's empty margin, past the cell)
        cells.append(cell)
    if lost: print(f'  warning: {lost} frame(s) reach past the {FW}x{FH} cell and are cut: the animal is bigger than the sheet allows (check the scale)')
    fit = np.median([stats([c])[1][0] for c in cells]) / A_old
    print(f'the clip\'s body area is {fit * 100:.0f}% of the placeholder\'s (a pose that shows more or less of the animal moves it a little)')

    if a.preview:
        pw, ph = FW, FH; pv = Image.new('RGB', (pw * n, ph * 2), BG_PREVIEW)
        for i in range(n):
            pv.paste(old[i], (i * pw, 0), old[i]); pv.paste(cells[i], (i * pw, ph), cells[i])
        pv.save(a.preview); print('preview (top: the placeholder, bottom: the imported clip):', a.preview)
    if a.dry_run: print('dry run: the sheet is not written'); return
    new = sheet.copy()
    for i, c in enumerate(cells):
        x, y = (start + i) * FW, row * FH
        new.paste(Image.new('RGBA', (FW, FH), (0, 0, 0, 0)), (x, y)); new.alpha_composite(c, (x, y))
    outd = Path(a.out_sheet) if a.out_sheet else art; outd.mkdir(parents=True, exist_ok=True)
    new.save(outd / 'sheet.webp', 'WEBP', quality=95, alpha_quality=100, method=6)
    imp = js.setdefault('imported', {}); hs = imp.setdefault(a.clip, [])
    if row not in hs: hs.append(row); hs.sort()
    everything = all(len(imp.get(c, [])) == 8 for c in ('graze', 'lookup', 'walk'))
    js['art'] = 'chatgpt' if everything else 'mixed'
    (outd / 'sheet.json').write_text(json.dumps(js, indent=1), encoding='utf-8')
    print(f'wrote {outd / "sheet.webp"}: {a.animal} {a.clip} at {a.heading} (row {row}, columns {start}-{start + n - 1}); imported so far: {imp}')


if __name__ == '__main__':
    main()
