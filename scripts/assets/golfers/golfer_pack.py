"""Golfer idle + walk packs for the owner's ChatGPT (issue #1235; the owner, 2026-11-13: "a chat gpt work flow where i can open chat gpt and you
generate new animation sprites ... the players and their normal pose and walking"). The route is docs/art/GOLFERS-CHATGPT.md.

Per golfer (art/golfers/<id>) and heading (S SW W NW N NE E SE: each its own picture, never mirrored) a folder
<out>/<id>/<H>/ with
  ref.png    who the golfer is: the current sheet's standing frame at four headings (front, three-quarter, side, back), enlarged, on flat grey
  guide.png  the 3x3 layout ChatGPT paints over: the current frames at this heading (cell 1 the standing pose, cells 2-9 the walk), on the key colour
  PROMPT.md  the prompt (the heading in screen words, the key colour)
  CHECKS.md  what to look at before importing
and, in the bridge folder, queue-golfers.json ([name, ref, guide, prompt] per picture: runner.js's __start('golfers')) and prompt-golfers.txt
(the prompt with {heading} and {key} left in: the hand route).

usage: python golfer_pack.py [--golfer golf_pro_m1 ...] [--heading S ...] [--out D:/AI/chatgpt-bridge/guides/golfers] [--bridge D:/AI/chatgpt-bridge]
       [--skip-done]  (leave out a heading whose picture is already in <bridge>/in)
"""
import argparse, json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / 'art' / 'golfers'   # (--family spectators: art/spectators, e.g. the range attendant staff_range_m)
HEADINGS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE']
# where the golfer faces and walks on screen (the rows of the sheet; S is toward the viewer, E is to the right)
FACING = {
    'S': 'facing the viewer, walking straight toward the bottom of the picture (his front and face seen)',
    'SW': 'walking toward the lower left of the picture (his front seen at three-quarters, his face turned to the left)',
    'W': 'walking to the left (seen from his side, his face in profile looking left)',
    'NW': 'walking toward the upper left of the picture, away from the viewer (seen at three-quarters from behind, the back of his head, a little of his left cheek); the sun is ahead of him at the upper right, so his back is mostly in soft shade with only his right shoulder and right side catching the light',
    'N': 'walking straight away from the viewer toward the top of the picture (seen from behind: his back and the back of his head); the sun is ahead of him at the upper right, so his back is mostly in soft shade with only his right shoulder and right side catching the light',
    'NE': 'walking toward the upper right of the picture, away from the viewer (seen at three-quarters from behind, the back of his head, a little of his right cheek); the sun is ahead of him at the upper right, so his back is mostly in soft shade with only his right shoulder and right side catching the light',
    'E': 'walking to the right (seen from his side, his face in profile looking right)',
    'SE': 'walking toward the lower right of the picture (his front seen at three-quarters, his face turned to the right)',
}
# flat key colours for the background, picked per golfer as the one farthest from its clothes and skin
KEYS = {'magenta': ((255, 0, 255), '#FF00FF'), 'green': ((0, 177, 64), '#00B140'), 'blue': ((40, 90, 220), '#285ADC')}
GRID, CELL, K, FEET = 1024, 1024 // 3, 1.15, 315   # the guide: 3x3 cells of 341 px, the current frames at 1.15x, feet 315 px down a cell
# the clips (#1235, the owner 2026-11-14: "the animations too"): each its own picture per heading, on a landscape 1536 x 1024 grid; the sheet
# (standing + walk) keeps the 3x3 square above. The guide crops each clip to its reach at that heading (all frames' union), so the figure is big
CLIPS = {'sheet': (3, 3, 1024, 1024), 'golf_drive': (4, 3, 1536, 1024), 'golf_putt': (4, 2, 1536, 1024), 'pick': (2, 2, 1024, 1024)}

PROMPT = """Use only the two pictures attached to this message (ignore earlier pictures in this chat). Create an image: a 3x3 sprite sheet of one {who} for a painted isometric golf game.

Reference 1 shows who the {who} is (him standing, from the front, the side and the back): keep his face, hair, skin, build and his exact clothes and colours ({outfit}). Mid-1980s golf clothes, no logos, no text.

Reference 2 is the layout to paint over: nine cells, the {who} in each, all at the same heading: {facing}. Keep that heading, the camera, the size and the place of the figure in every cell exactly as reference 2 has them, and keep his feet on the same ground line in every cell. The renders' poses are only rough; paint these poses:
- cell 1 (top left): standing still, relaxed and upright, weight on both feet a little apart, arms hanging loosely at his sides, head up looking ahead.
- cells 2 to 9 (left to right, then the next row): one smooth loop of a confident, relaxed walk, in order: right heel touching down in front; weight settling on the right foot; left leg swinging past the right; rising on the right foot; left heel touching down in front; weight settling on the left foot; right leg swinging past the left; rising on the left foot (so cell 9 leads back into cell 2). Clear strides and an easy arm swing opposite to the legs, head up looking where he walks, never looking down. The same person, clothes and size in every cell.

Style: a painterly isometric game sprite, soft brushwork, natural colours, clean readable shapes, no outline. Camera: orthographic, looking down at about 30 degrees, exactly as in reference 2, never mirrored. Light: one sun at the upper right of the picture: the parts of him facing the upper right lit, the far and lower parts gently shaded, no rim light, no glow.

Background: one flat, even {keyname} colour ({key}) filling the whole picture and every gap (between the legs, between an arm and the body). No ground, no shadow on the ground, no grid lines, no borders, no text, no numbers."""

CLIP_HEAD = """Use only the two pictures attached to this message (ignore earlier pictures in this chat). Create an image: a {cols}x{rows} sprite sheet of one {who} for a painted isometric golf game.

Reference 1 shows who the {who} is (him standing, from the front, the side and the back): keep his face, hair, skin, build and his exact clothes and colours ({outfit}). Mid-1980s clothes, no logos, no text.

Reference 2 is the layout to paint over: {n} cells ({cols} across, {rows} down, read left to right then the next row), the {who} in each, all at the same heading: {facing}. Keep that heading, the camera, the size and the place of the figure in every cell exactly as reference 2 has them, his feet planted on the same spot of the same ground line in every cell (they do not move during the stroke), and keep each pose close to reference 2's (the renders are rough: paint them as a real person)."""
CLIP_POSES = {
    'golf_drive': """One full drive with a driver (a wooden-headed 1985 driver, a dark shaft, no ball, no tee), twelve phases in this order (the game times them, so keep each in its own cell):
1 address: knees flexed, back tilted, arms hanging, the club head on the ground behind where the ball would be;
2 takeaway: the club swung back low, the shaft level with the ground;
3 half-way back: the lead arm level, the club pointing up;
4 the top: fully turned, the club over the back shoulder, the shaft about level behind his head;
5 starting down: hips turning toward the target, the club still high;
6 half-way down: the club level again, the wrists still cocked;
7 impact: the club head at the ground where the ball was, arms straight;
8 just after impact: both arms extended toward the target, the club low;
9 follow-through: the club rising over the lead shoulder, the chest turned to the target;
10 high finish: belly facing the target, the back heel up on its toe;
11 finish held;
12 holding the finish, relaxed, the club resting over the shoulder.
The swing is the same smooth motion through all twelve; the club is one straight shaft in every cell, never bent or doubled.""",
    'golf_putt': """One putt with a putter (a 1985 blade putter, no ball), in order:
1 address: bent over the ball spot, eyes down, the putter head on the ground, hands together;
2 the putter starting back, low along the ground;
3 the top of a short backstroke;
4 the putter coming forward;
5 impact: the putter head back at the ball spot;
6 follow-through: the putter head forward past the ball spot, low;
7 holding the follow-through, head still down;
8 looking up after the ball, the putter still forward.
Only the arms, shoulders and putter move; the body stays still, the feet planted.""",
    'pick': """Picking up golf balls from the grass, four phases in this order (a loop): he carries a round wire range basket half full of white golf balls in his left hand in every cell, no other tool:
1 standing over a ball, the basket at his side, looking down at the ball by his right foot;
2 bending at the hips and knees, reaching down with his right hand;
3 crouched low, his right hand at the grass picking up the ball;
4 rising again, dropping the ball into the basket.
His feet stay planted on the same spot in all four cells.""",
}
CLIP_TAIL = """

Style: a painterly isometric game sprite, soft brushwork, natural colours, clean readable shapes, no outline. Camera: orthographic, looking down at about 30 degrees, exactly as in reference 2, never mirrored. Light: one sun at the upper right of the picture: the parts of him facing the upper right lit, the far and lower parts gently shaded, no rim light, no glow.

Background: one flat, even {keyname} colour ({key}) filling the whole picture and every gap (between the legs, between the arms and the club). No ground, no shadow on the ground, no grid lines, no borders, no text, no numbers. Each figure and its whole club inside its own cell, never crossing into the next."""

CHECKS = """# Checks for {name} ({heading})
- The same golfer as ref.png: face, hair, skin, shirt and trousers colours, shoes, glove. No logo, no text.
- All nine figures face {facing_short}; none mirrored; the camera looks down as in guide.png.
- Cell 1 stands still (feet a little apart, arms down, head up). Cells 2-9 are one walk loop: the legs alternate, the arms swing opposite, cell 9 leads into cell 2.
- Every figure the same size, feet on one ground line in its cell, no figure touching or crossing into another cell.
- The background one flat {key} everywhere (also between the legs), no ground, no shadow, no lines.
- The light from the upper right.
Then save the picture as {name}-golfers.png in D:/AI/chatgpt-bridge/in (the runner does this itself) and import it (docs/art/GOLFERS-CHATGPT.md).
"""
SHORT = {'S': 'the viewer', 'SW': 'the lower left', 'W': 'the left', 'NW': 'the upper left (from behind)', 'N': 'away (from behind)',
         'NE': 'the upper right (from behind)', 'E': 'the right', 'SE': 'the lower right'}


def frames(gid, clip='sheet', like=None):
    """the current sheet (or a clip sheet: golf_drive, golf_putt): frames[heading][column] as RGBA cells, and its json. A clip sheet that was
    already imported reads its kept original (<clip>-old.webp), so a re-run is painted over the 3D renders, not over ChatGPT's last try"""
    gid = like or gid   # (a new person's guide frames come from the person it is modelled on: --like)
    old = ART / gid / f'{clip}-old.webp'
    j = json.loads((ART / gid / f'{clip}.json').read_text())
    sheet = Image.open(old if clip != 'sheet' and old.exists() else ART / gid / f'{clip}.webp').convert('RGBA'); fw, fh = j['frameWidth'], j['frameHeight']
    out = {}
    for r, h in enumerate(j['directions']):
        out[h] = [sheet.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh)) for c in range(len(j['frames']))]
    return out, j


def pick_key(cells):
    """the key colour farthest from the golfer's own pixels (its 1st percentile distance)"""
    px = []
    for row in cells.values():
        for im in row[:1]:
            px += [p[:3] for p in zip(*[iter(im.tobytes())] * 4) if p[3] > 200]   # RGBA pixels
    best, bestd = None, -1
    for name, (rgb, _) in KEYS.items():
        ds = sorted(sum((a - b) ** 2 for a, b in zip(p, rgb)) for p in px[::7])
        d = ds[len(ds) // 100] if ds else 0
        if d > bestd: best, bestd = name, d
    return best


def outfit(cells):
    """a few words on the clothes from the standing front frame: the main colours of the shirt and trousers bands"""
    im = cells['S'][0]; bb = im.getbbox()
    if not bb: return 'as in reference 1'
    x0, y0, x1, y1 = bb; h = y1 - y0

    def band(a, b):
        ps = [p[:3] for y in range(int(y0 + a * h), int(y0 + b * h)) for x in range(x0, x1) for p in [im.getpixel((x, y))] if p[3] > 200]
        if not ps: return None
        ps.sort(key=sum); m = ps[len(ps) // 2]
        return '#%02X%02X%02X' % m
    shirt, trousers = band(0.22, 0.42), band(0.55, 0.8)
    return f'the shirt about {shirt}, the trousers about {trousers}, as in reference 1' if shirt and trousers else 'as in reference 1'


def ref_png(cells, path):
    views = ['S', 'SE', 'E', 'N']
    ims = [cells[h][0].resize((cells[h][0].width * 2, cells[h][0].height * 2), Image.LANCZOS) for h in views]
    w, h = sum(i.width for i in ims), ims[0].height + 60
    out = Image.new('RGBA', (w, h), (200, 200, 200, 255))
    x = 0
    for i in ims: out.alpha_composite(i, (x, 20)); x += i.width
    out.convert('RGB').save(path)


def guide_png(row, j, key, path):
    out = Image.new('RGBA', (GRID, GRID), key + (255,))
    ax, ay = j['anchor']['x'], j['anchor']['y']
    for c, im in enumerate(row):
        s = im.resize((round(im.width * K), round(im.height * K)), Image.LANCZOS)
        cx, cy = (c % 3) * CELL + CELL // 2, (c // 3) * CELL + FEET
        out.alpha_composite(s, (round(cx - ax * K), round(cy - ay * K)))
    out.convert('RGB').save(path)


def pick_frames(gid, a):
    """the pick clip's guide frames per heading: the person's standing frame (cells 1 and 4) and a crouch from another rigged person
    (--guide-pick, the caddie's read_putt: cells 2 and 3), the crouch scaled to the standing frame's height share"""
    cells, j = frames(gid, like=a.like)
    pid, pclip, pf = a.guide_pick.split(':'); pj = json.loads((ART / pid / f'{pclip}.json').read_text())
    psheet = Image.open(ART / pid / f'{pclip}.webp').convert('RGBA'); pw, ph = pj['frameWidth'], pj['frameHeight']
    k = (j['heightMetres'] / pj.get('heightMetres', j['heightMetres'])) * (j['anchor']['y'] / pj['anchor']['y'])
    out = {}
    for r, h in enumerate(j['directions']):
        c = psheet.crop((int(pf) * pw, pj['directions'].index(h) * ph, (int(pf) + 1) * pw, (pj['directions'].index(h) + 1) * ph))
        c = c.resize((round(pw * k), round(ph * k)), Image.LANCZOS)
        crouch = Image.new('RGBA', cells[h][0].size, (0, 0, 0, 0)); crouch.paste(c, (round(j['anchor']['x'] - pj['anchor']['x'] * k), round(j['anchor']['y'] - pj['anchor']['y'] * k)), c)
        out[h] = [cells[h][0], crouch, crouch, cells[h][0]]
    return out, j


def clip_guide_png(row, layout, key, path):
    """a clip's guide: the frames of one heading in a cols x rows grid, cropped to their union (the reach of the swing) plus a margin and
    scaled to fill a cell; returns the crop box and the scale (the importer does not need them: it measures)"""
    cols, rows, W, H = layout; cw, ch = W // cols, H // rows
    x0 = y0 = 10 ** 9; x1 = y1 = -1
    for im in row:
        bb = im.getbbox()
        if bb: x0, y0, x1, y1 = min(x0, bb[0]), min(y0, bb[1]), max(x1, bb[2]), max(y1, bb[3])
    m = 12; x0, y0, x1, y1 = max(0, x0 - m), max(0, y0 - m), x1 + m, y1 + m
    k = min(cw / (x1 - x0), ch / (y1 - y0), 1.6)
    out = Image.new('RGBA', (W, H), key + (255,))
    for c, im in enumerate(row):
        s = im.crop((x0, y0, x1, y1)); s = s.resize((round(s.width * k), round(s.height * k)), Image.LANCZOS)
        cx, cy = (c % cols) * cw + (cw - s.width) // 2, (c // cols) * ch + (ch - s.height) // 2
        out.alpha_composite(s, (cx, cy))
    out.convert('RGB').save(path)
    return (x0, y0, x1, y1), k


def gender(text, gid):
    """the prompts say he/his/him; a woman golfer (golf_*_w*) gets she/her"""
    if '_w' not in gid: return text
    import re
    return re.sub(r'\b(he|his|him)\b', lambda m: {'he': 'she', 'his': 'her', 'him': 'her'}[m.group(1)], text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--golfer', nargs='*'); ap.add_argument('--heading', nargs='*', default=HEADINGS)
    ap.add_argument('--out', default='D:/AI/chatgpt-bridge/guides/golfers'); ap.add_argument('--bridge', default='D:/AI/chatgpt-bridge')
    ap.add_argument('--skip-done', action='store_true')
    ap.add_argument('--clip', default='sheet', choices=list(CLIPS), help='sheet (standing + walk), golf_drive, golf_putt or pick')
    ap.add_argument('--family', default='golfers', help='the art folder: golfers or spectators (the staff: staff_range_m)')
    ap.add_argument('--who', default='golfer', help='the prompt\'s word for the person: golfer, range attendant ...')
    ap.add_argument('--ref', help='reference 1 instead of the sheet\'s standing frames (a new person: its painted design picture)')
    ap.add_argument('--like', help='a new person: the guide frames come from this person of the family (same rig and camera)')
    ap.add_argument('--guide-pick', default='staff_caddie_w:read_putt:1', help='pick clip: the crouch frame for cells 2-3 (person:clip:frame)')
    ap.add_argument('--note', help='words added to the clothes line, e.g. "the trousers pure white, not beige or cream" (a re-run of a colour that drifted)')
    a = ap.parse_args()
    global ART
    ART = ROOT / 'art' / a.family
    gids = a.golfer or sorted(d.name for d in ART.iterdir() if (d / 'sheet.json').exists())
    out, bridge, queue = Path(a.out), Path(a.bridge), []
    for gid in gids:
        cells, j = frames(gid, like=a.like)
        keyname = pick_key(cells); key, keyhex = KEYS[keyname]; wear = outfit(cells)
        if a.clip != 'sheet':
            ccells, cj = pick_frames(gid, a) if a.clip == 'pick' else frames(gid, a.clip, like=a.like)
            wear = 'exactly as in reference 1 (his painted standing pose: the clothes to copy)' + ('; ' + a.note if a.note else '')   # (the sampled colours misread shorts and skirts)
        if a.note: wear += '; ' + a.note
        (out / gid).mkdir(parents=True, exist_ok=True); ref = out / gid / 'ref.png'
        if a.ref: Image.open(a.ref).convert('RGB').save(ref)
        else: ref_png(cells, ref)
        for h in a.heading:
            name = f'{gid}~{h}' + ('' if a.clip == 'sheet' else f'~{a.clip}')
            if a.skip_done and (bridge / 'in' / f'{name}-golfers.png').exists(): continue
            d = out / gid / h / ('' if a.clip == 'sheet' else a.clip); d.mkdir(parents=True, exist_ok=True)
            (d / 'ref.png').write_bytes(ref.read_bytes())
            if a.clip == 'sheet':
                guide_png(cells[h], j, key, d / 'guide.png')
                p = gender(PROMPT.format(who=a.who, outfit=wear, facing=FACING[h], keyname=keyname, key=keyhex), gid)
            else:
                cols, rows, _, _ = CLIPS[a.clip]
                clip_guide_png(ccells[h], CLIPS[a.clip], key, d / 'guide.png')
                p = gender(CLIP_HEAD.format(who=a.who, cols=cols, rows=rows, n=cols * rows, outfit=wear, facing=FACING[h].replace('walking', 'his body facing')) + '\n\n' + CLIP_POSES[a.clip]
                           + CLIP_TAIL.format(keyname=keyname, key=keyhex), gid)
            (d / 'PROMPT.md').write_text(p + '\n', encoding='utf-8')
            (d / 'CHECKS.md').write_text(CHECKS.format(name=name, heading=h, facing_short=SHORT[h], key=keyhex), encoding='utf-8')
            queue.append([name, (d / 'ref.png').as_posix(), (d / 'guide.png').as_posix(), p])
        print(f'{gid}: key {keyname}, {wear}')
    (bridge / 'queue-golfers.json').write_text(json.dumps(queue))
    (bridge / 'prompt-golfers.txt').write_text(PROMPT.format(who='{who}', outfit='{outfit}', facing='{facing}', keyname='{keyname}', key='{key}') + '\n', encoding='utf-8')
    print(f'{len(queue)} pictures queued in {bridge / "queue-golfers.json"}')


if __name__ == '__main__':
    main()
