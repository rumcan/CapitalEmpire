"""T309: the contact sheets for the owner, from the sheets in the repo (art/animals/<id>/sheet.webp + sheet.json), at the game's display size (half the art's).
 <prefix>-headings.png: every animal x heading x clip: one block an animal of 3 rows (graze, look up, walk), 8 columns (the headings SE S SW W NW N NE E),
   one representative frame in each cell (graze 1, look up: head up, walk 3), every cell the animal's own cell of its sheet (one size, one anchor).
 <prefix>-clips.png: every frame of every clip, one row an animal, at the W heading (the profile): graze 1-4, look up 1-3, walk 1-8.
usage: python contact.py <prefix> [scale]"""
import json, os, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[3]; IDS = ['cow-holstein', 'cow-brown', 'horse-bay', 'horse-chestnut', 'horse-grey', 'sheep-white', 'sheep-blackface']
NAMES = ['SE', 'S', 'SW', 'W', 'NW', 'N', 'NE', 'E']
ROWS = [('graze', 0), ('look up', 6), ('walk', 9)]
BG = (122, 148, 92)


def load():
    out = []
    for iid in IDS:
        d = REPO / 'art' / 'animals' / iid
        if (d / 'sheet.webp').exists(): out.append((iid, json.loads((d / 'sheet.json').read_text()), Image.open(d / 'sheet.webp').convert('RGBA')))
    return out


def cell(sheet, js, k, f, scale):
    fw, fh = js['frameWidth'], js['frameHeight']
    im = sheet.crop((f * fw, k * fh, f * fw + fw, k * fh + fh))
    return im.resize((max(1, round(fw * scale)), max(1, round(fh * scale))), Image.LANCZOS)


def fonts():
    try: return ImageFont.truetype('arial.ttf', 14), ImageFont.truetype('arialbd.ttf', 16)
    except OSError: f = ImageFont.load_default(); return f, f


def headings(blocks, out, scale):
    font, big = fonts()
    cw = max(round(js['frameWidth'] * scale) for _, js, _ in blocks); ch = max(round(js['frameHeight'] * scale) for _, js, _ in blocks)
    Hb = len(ROWS) * ch + 26; W = 8 * cw + 90; H = 30 + len(blocks) * Hb
    im = Image.new('RGB', (W, H), BG); dr = ImageDraw.Draw(im)
    for k in range(8): dr.text((90 + k * cw + cw // 2 - 10, 6), NAMES[k], fill=(0, 0, 0), font=big)
    for b, (iid, js, sh) in enumerate(blocks):
        y0 = 30 + b * Hb; dr.text((6, y0 + 4), iid, fill=(0, 0, 0), font=big); dr.line([(0, y0), (W, y0)], fill=(80, 100, 60))
        for r, (label, f) in enumerate(ROWS):
            y = y0 + 22 + r * ch; dr.text((6, y + ch // 2), label, fill=(0, 0, 0), font=font)
            for k in range(8):
                c = cell(sh, js, k, f, scale); im.paste(c, (90 + k * cw + (cw - c.width) // 2, y + ch - c.height), c)
    im.save(out); print('saved', out, im.size)


def clips(blocks, out, scale, k=3):
    font, big = fonts()
    nf = 15; cw = max(round(js['frameWidth'] * scale) for _, js, _ in blocks); ch = max(round(js['frameHeight'] * scale) for _, js, _ in blocks)
    W = nf * cw + 90; H = 30 + len(blocks) * (ch + 22)
    im = Image.new('RGB', (W, H), BG); dr = ImageDraw.Draw(im)
    labels = ['graze 1', 'graze 2', 'graze 3', 'graze 4', 'look 1', 'look 2', 'look 3'] + [f'walk {i + 1}' for i in range(8)]
    for f in range(nf): dr.text((90 + f * cw + 4, 8), labels[f], fill=(0, 0, 0), font=font)
    for b, (iid, js, sh) in enumerate(blocks):
        y0 = 30 + b * (ch + 22); dr.text((6, y0 + ch // 2), iid, fill=(0, 0, 0), font=font); dr.line([(0, y0), (W, y0)], fill=(80, 100, 60))
        for f in range(nf):
            c = cell(sh, js, k, f, scale); im.paste(c, (90 + f * cw + (cw - c.width) // 2, y0 + 20 + ch - c.height), c)
    im.save(out); print('saved', out, im.size)


if __name__ == '__main__':
    blocks = load(); scale = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
    headings(blocks, sys.argv[1] + '-headings.png', scale); clips(blocks, sys.argv[1] + '-clips.png', scale)
