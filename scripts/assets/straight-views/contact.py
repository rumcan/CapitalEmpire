"""T398 contact sheet of one building: top row the four existing corner views (as the game draws them: the library's display scale per view), bottom row the four
new straight views in the sheet's cell order (N E S W), drawn at the straight views' derived display scale; footprint anchors on one baseline. S = shrink."""
import sys, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
REPO = 'F:/Repos/ce-wt/t356'; PROJ = 'F:/ClaudeTemp/T398/proj/art/theme-consistency/native-resume-20261106'; AN = 'F:/ClaudeTemp/T398/analysis'
BG = (112, 118, 124, 255)
try: FONT = ImageFont.truetype('arial.ttf', 14); FONTB = ImageFont.truetype('arialbd.ttf', 15)
except Exception: FONT = FONTB = ImageFont.load_default()
def load(path): return Image.open(path).convert('RGBA')
def contact(disk, out, S=0.5, shift=0, kS=None):
    a = json.load(open(f'{AN}/{disk}.json')); slug = a['id'].replace(':', '-')
    names = ['NE', 'SE', 'SW', 'NW']; keys = ['normalNE', 'normalSE', 'normalSW', 'normalNW']
    cells = ['N', 'E', 'S', 'W']; skeys = ['yaw8N', 'yaw8E', 'yaw8S', 'yaw8W']
    ks = kS if kS is not None else a['kStraightMedian']
    items = []
    for i in range(4):   # (image, display scale, anchor in picture px (padded for the straights), label)
        im = load(f'{REPO}/art/building-views/{slug}/{names[i]}.png'); f = a['fit'][keys[i]]
        items.append((im, a['kLib'][keys[i]] * S, f['anchor'], f'{names[i]}  k {a["kLib"][keys[i]]:.3f}  iou {f["iou"]}', 0, i))
    for i in range(4):
        j = (i + shift) % 4
        im = load(f'{PROJ}/{disk}/turned/{cells[j]}.native.png'); f = a['fit'][skeys[j]]
        p2 = a.get('pass2', {}).get('anchors', {}).get(skeys[j]); fa = p2 if p2 else f['anchor']
        anchor = {'x': fa['x'] - 8, 'y': fa['y'] - 8}                    # fitted on the 8-px padded copy
        if p2: f = {'iou': a['pass2']['iou'][j]}
        items.append((im, ks * S, anchor, f'{"NESW"[i]} (sheet cell {cells[j]})  k {ks:.3f}  iou {f["iou"]}', 1, i))
    cw = int(max(it[0].width * it[1] for it in items)) + 24
    up = max(it[2]['y'] * it[1] for it in items) + 16; down = max((it[0].height - it[2]['y']) * it[1] for it in items) + 16
    rh = int(up + down)
    W = 4 * cw; H = 2 * rh + 56
    sheet = Image.new('RGBA', (W, H), BG); d = ImageDraw.Draw(sheet)
    try:
        lt = json.load(open('E:/ClaudeTemp/T398/work/light.json'))[disk]; g, w_ = lt['glow'][0], lt['warm'][0]
        light = 'light: matches' if (w_ <= 90 and g <= 0.05) else f'light: OLD corners (glow {g:.2f} warm {w_:.0f})'
    except Exception: light = ''
    d.text((W - 330, 4), light, fill=(255, 190, 120, 255), font=FONTB)
    d.text((6, 4), f'{a["id"]}   box {a["footprint"][0]:.1f} x {a["footprint"][1]:.1f} m   corners k {a["kCornerMedian"]}  straights k {a["kStraightMedian"]} ({" ".join(f"{x:.2f}" for x in a["kStraight"])})', fill=(255, 245, 190, 255), font=FONTB)
    for n, (im, k, anc, label, row, col) in enumerate(items):
        w, h = max(1, round(im.width * k)), max(1, round(im.height * k)); r = im.resize((w, h), Image.LANCZOS)
        x0 = col * cw + cw // 2 - round(anc['x'] * k); y0 = 28 + row * (rh + 16) + round(up - anc['y'] * k)
        base = 28 + row * (rh + 16) + round(up)
        d.line([(col * cw + 4, base), (col * cw + cw - 4, base)], fill=(70, 75, 80, 255), width=1)
        sheet.alpha_composite(r, (x0, y0))
        cx = col * cw + cw // 2; d.line([(cx - 6, base), (cx + 6, base)], fill=(255, 230, 0, 255), width=2); d.line([(cx, base - 6), (cx, base + 6)], fill=(255, 230, 0, 255), width=2)
        d.text((col * cw + 6, 28 + row * (rh + 16) + 2), label, fill=(255, 255, 255, 255) if row else (200, 230, 255, 255), font=FONT)
    sheet.convert('RGB').save(out)
    return sheet.size
if __name__ == '__main__':
    disk = sys.argv[1]; shift = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    print(contact(disk, f'E:/ClaudeTemp/T398/contact/{disk}.png', shift=shift))
