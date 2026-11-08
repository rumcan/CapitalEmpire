"""T309 (#894): the ChatGPT pack of an animal: what the lead uploads and pastes into ChatGPT's GIF generator, one folder a clip (and heading).
The owner, 2026-11-08: "farm animals must go to the chatgpt AI to generate the animations". The route (docs/art/ANIMALS-CHATGPT.md):
  this script -> <out>/<animal>-<clip>[-<HEADING>]/ {ref.png, camera.png, pose-guide.png (optional), PROMPT.md, CHECKS.md}, and <out>/README.md
  the lead runs PROMPT.md in ChatGPT with ref.png and camera.png, saves the GIF as <folder>/result.gif
  scripts/assets/animals/import_frames.py <folder>/result.gif --animal <id> --clip <clip> --heading <H> --preview ...   (cuts, keys, scales, writes the sheet)
  node scripts/assets/prep-animals.mjs   (packs the sheets into the atlas; through bash E:/ClaudeTemp/heavy.sh)

  ref.png        the animal standing (the look-up clip's last frame: head up), at the heading, at the game's camera (30 degrees down), the game's own light (the sun
                 at the upper right), rendered from the Idol splat at about 2.5 times the art's size on the flat grey the clip is asked to have. (--render: GPU)
  camera.png     an in-game shot of the animal in its paddock with a person standing near it (scripts/dev/animal-camera-shot.mjs; copied from --camera)
  pose-guide.png the placeholder's frames of the clip at the heading on the same grey (optional: upload only if ChatGPT's first try gets the motion wrong)
usage: python chatgpt_pack.py --animal cow-brown [--headings SE|all|SE,S,...] [--clips walk,graze,lookup] [--out E:/ClaudeTemp/T309/chatgpt]
                              [--camera path/to/camera.png] [--render] [--bg 217,217,217]
  without --render the stills must exist already (<out>/stills/<animal>-<HEADING>.png: this script puts them there); the text is always rewritten"""
import argparse, json, os, shutil, sys
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parents[3]
HEADINGS = ['SE', 'S', 'SW', 'W', 'NW', 'N', 'NE', 'E']
# what the animal is (image 1): a short look, a pronoun set, its kind
ANIMALS = {
    'cow-holstein': dict(title='black-and-white cow', kind='cow', pro=('she', 'her', 'She'),
                         look='a black-and-white Holstein dairy cow: irregular black patches on a white coat, a mostly black head with a pale face, white belly and legs, a pink nose, small pale horns, dark hooves, a thin tail with a pale tuft'),
    'cow-brown': dict(title='brown cow', kind='cow', pro=('she', 'her', 'She'),
                      look='a Jersey-type brown dairy cow: a warm golden-brown coat, a little darker on the head, neck and shoulders and paler tan on the belly and legs, a dark nose, small pale curved horns, dark hooves, a thin tail with a dark tuft'),
    'horse-bay': dict(title='bay horse', kind='horse', pro=('it', 'its', 'It'),
                      look='a bay horse: a rich reddish-brown body with a black mane, a black tail and black lower legs, dark hooves, small ears'),
    'horse-chestnut': dict(title='chestnut horse', kind='horse', pro=('it', 'its', 'It'),
                           look='a chestnut horse: a glossy copper-red body, a slightly lighter flaxen-red mane and tail, a white blaze down the face, a plain brown leather halter, dark hooves'),
    'horse-grey': dict(title='dapple-grey horse', kind='horse', pro=('it', 'its', 'It'),
                       look='a dapple-grey horse: a pale grey body with darker grey dapples, a charcoal mane and tail, dark grey lower legs and hooves'),
    'sheep-white': dict(title='white sheep', kind='sheep', pro=('she', 'her', 'She'),
                        look='a woolly white sheep: a thick cream-white fleece, a pale pinkish face with small ears, dark brown legs and hooves, a short tail'),
    'sheep-blackface': dict(title='black-faced sheep', kind='sheep', pro=('she', 'her', 'She'),
                            look='a black-faced sheep: a thick cream-white fleece, a black face and ears, small curved dark horns, black legs and hooves, a short tail'),
}
# where the animal faces on the picture and what shows (the camera is south of the field looking north, 30 degrees down; the sun is at the upper right)
FACING = {
    'SE': ('down-right', 'the nose points toward the lower right corner of the picture, so you see the face three-quarter on, the chest and the right flank'),
    'S': ('toward the viewer', 'the nose points straight down the picture toward the viewer, so you see the face and chest head-on'),
    'SW': ('down-left', 'the nose points toward the lower left corner of the picture, so you see the face three-quarter on, the chest and the left flank'),
    'W': ('left', 'the nose points to the left of the picture, so you see the left side in profile, seen from above at 30 degrees'),
    'NW': ('up-left, away from the viewer', 'the nose points toward the upper left corner of the picture, away from the viewer, so you see the rump and the left flank'),
    'N': ('away from the viewer', 'the nose points straight up the picture, away from the viewer, so you see the rump from behind'),
    'NE': ('up-right, away from the viewer', 'the nose points toward the upper right corner of the picture, away from the viewer, so you see the rump and the right flank'),
    'E': ('right', 'the nose points to the right of the picture, so you see the right side in profile, seen from above at 30 degrees'),
}
CLIPS = {  # frames, fps (about), loops
    'walk': dict(n=8, fps=6, loop=True), 'graze': dict(n=4, fps=2, loop=True), 'lookup': dict(n=3, fps=5, loop=False)}
BG = (217, 217, 217)


def kindwords(kind):
    return {
        'cow': dict(walk='a slow, calm four-beat walk (left hind, left front, right hind, right front)', nod='the head nods slightly with each step, carried low and level',
                    tail='the tail sways a little', graze='the head lowered to graze', chew='the jaw works', ear='an ear flicks', swish='the tail swishes gently to one side and back'),
        'horse': dict(walk='a relaxed four-beat walk (left hind, left front, right hind, right front)', nod='the head nods gently with each step and the mane sways',
                      tail='the tail swings a little', graze='the head lowered to graze, the mane falling forward', chew='the lips and jaw work', ear='an ear flicks', swish='the tail swishes gently to one side and back'),
        'sheep': dict(walk='a steady, short-stepped four-beat walk (left hind, left front, right hind, right front)', nod='the head nods slightly with each step',
                      tail='the short tail twitches now and then', graze='the head lowered into the grass', chew='the jaw works', ear='an ear flicks', swish='the short tail twitches once'),
    }[kind]


def action(clip, a, H):
    kw = kindwords(a['kind']); noun = a['title'].split()[-1]; sub, obj, Sub = a['pro']
    if clip == 'walk':
        return (f"a walk cycle IN PLACE, like a treadmill: the {noun}'s body stays at the same spot in the frame and does not travel across the picture. One full stride of "
                f"{kw['walk']}: the legs swing, the hooves lift and come down on the same ground line, {kw['nod']}, {kw['tail']}. Eight frames evenly spaced through one "
                f"stride; the last frame leads smoothly back into the first, so the loop is seamless.")
    if clip == 'graze':
        return (f"the {noun} stands grazing: {kw['graze']}, the muzzle just above the ground (a hand's breadth), the neck stretched down and forward. Over four frames {sub} nods and chews "
                f"slowly: the head dips a few degrees and comes back, {kw['chew']}, {kw['ear']}, {kw['swish']}. All four hooves stay planted and the body does not move at all; only the head, "
                f"jaw, ears and tail move. The head stays down in every frame. Four frames; the last leads smoothly back into the first, so the loop is seamless.")
    return (f"the {noun} raises {obj} head from grazing. The first frame has the head lowered with the muzzle near the ground (about two thirds of the way down), the last frame has the head fully "
            f"raised in the standing pose of image 1 (neck up, ears forward, looking ahead along the heading), and the middle frame is halfway between. Three frames, steady and unhurried; "
            f"not a loop (it ends standing). The body and legs do not move, only the neck, head and ears (the tail may flick once).")


def prompt_text(animal, clip, H, bg):
    a = ANIMALS[animal]; c = CLIPS[clip]; noun = a['title'].split()[-1]; sub, obj, Sub = a['pro']; face, shows = FACING[H]
    hexbg = '#%02X%02X%02X' % bg
    # the animal's phrase for the picture and what the clip is
    verb = {'walk': 'walks slowly and calmly', 'graze': 'stands grazing', 'lookup': f'lifts {obj} head from grazing'}[clip]
    lines = [
        f"Make a looping animated GIF of the {a['title']} in image 1 ({a['look']}). {Sub} {verb}." if c['loop'] else
        f"Make a short animated GIF (not a loop) of the {a['title']} in image 1 ({a['look']}). {Sub} {verb}.",
        '',
        f"- Camera: fixed, high three-quarter view looking down at about 30 degrees, like a classic isometric game, exactly the angle in image 2. The {noun} faces {face}: {shows}; the same pose and angle as image 1. "
        f"The camera never moves, pans or zooms, and the {noun} never turns: it faces {face} in every frame.",
        f"- Action: {action(clip, a, H)}",
        f"- Size: the {noun} stays exactly the same size and in the same place in every frame, centred, with room all round so no horn, hoof, ear or tail is ever cut off; no cuts, no zoom.",
        f"- Lighting: one sun at the upper right: the top of the back and the parts facing right and up are lit, the left and under sides are in soft cool shade, the same in every frame.",
        f"- Background: plain flat light grey ({hexbg}) in every frame, no ground texture, no grass, no scenery, no text, and no shadow or dark patch on the ground (the game draws the shadow itself), so the {noun} can be cut out cleanly.",
        f"- Style: the painted, realistic 3D look of image 1: the same {noun}, with the same colours, markings and proportions in every frame (not a cartoon). {c['n']} frames, about {c['fps']} frames per second.",
        '',
        f"If you cannot make a GIF, make one picture with the {c['n']} frames side by side in a single row, equal cells, the {noun} the same size and in the same place in each cell, no captions or numbers.",
    ]
    return '\n'.join(lines)


def prompt_md(animal, clip, H, bg):
    a = ANIMALS[animal]; c = CLIPS[clip]; noun = a['title'].split()[-1]; face = FACING[H][0]
    why = {'walk': f"the game moves the {noun} across the field itself, so the walk must be a cycle in place",
           'graze': f"the {noun} grazes most of the time, so this is the main idle: the body still, the head down",
           'lookup': f"now and then the {noun} lifts its head and stands looking round; the game plays these frames forwards to lift the head and backwards to put it down"}[clip]
    return f"""# ChatGPT GIF: {a['title']}, {clip.replace('lookup', 'look-up')}, heading {H} ({face})

Why this clip: the game draws every farm animal from sheets of frames in 8 headings, never mirrored (the sun is at the upper right, so each heading is its own picture). This is the {clip.replace('lookup', 'look-up')} clip of the {a['title']} for the heading {H}; {why}. The Idol frames in the game now are placeholders.

## Upload
1. `ref.png`: the animal (colours, markings, build) and the heading: the game's own render, standing, facing {face}, on flat grey.
2. `camera.png`: the camera angle and the scale: the game's own shot of the animal in its paddock with a person standing near it (small and soft: that is how the game draws).
(`pose-guide.png` is optional: the placeholder's frames of this clip at this heading, for the poses. Upload it only if the first try gets the motion wrong.)

## Paste this prompt

{prompt_text(animal, clip, H, bg)}

## What I check when you send the GIF back
See `CHECKS.md`. Save the result as `result.gif` in this folder (a strip as `result.png`), then:
`python scripts/assets/animals/import_frames.py <this folder>/result.gif --animal {animal} --clip {clip} --heading {H} --preview preview.png --dry-run`
"""


def checks_md(animal, clip, H):
    a = ANIMALS[animal]; c = CLIPS[clip]; noun = a['title'].split()[-1]; face = FACING[H][0]
    motion = {
        'walk': [f"Walks in place: the body stays put and only the legs, head and tail move; the hooves land on one ground line and do not slide; the legs move in the walk's order; four legs in every frame, whole, no extra or missing leg, no melted hooves.",
                 f"The loop joins: frame {c['n']} leads into frame 1 with no pop."],
        'graze': [f"The body and hooves do not move; only the head, jaw, ears and tail do. The head stays down in every frame (muzzle near the ground).",
                  f"The loop joins: frame {c['n']} leads into frame 1 with no pop."],
        'lookup': [f"The head rises in even steps from low (muzzle near the ground) to up, ending in the standing pose of image 1; the body and legs do not move.",
                   f"Not a loop, so no join to check; the last frame should look like `ref.png`."]}[clip]
    items = [f"Same {noun} in every frame (colour, markings, build, the look in `ref.png`).",
             f"Fixed camera and fixed size: the {noun} does not drift, zoom or turn; it faces {face} (heading {H}) in every frame; nothing is cut off at the edge.",
             *motion,
             "Background: flat light grey in every frame, no ground texture, no shadow or dark patch under the feet, no text; the edge cuts out cleanly (look at the import preview).",
             "Light: the sun at the upper right in every frame (lit top and right-facing sides, soft shade on the left and underneath), the same in all frames.",
             f"Scale: about as big as in `ref.png` relative to the frame. The importer prints the scale it needs; the {noun}'s three clips should need scales within 5% of each other (import the walk first and pass its scale with `--scale` to the others if they differ)."]
    body = '\n'.join(f"{i + 1}. {t}" for i, t in enumerate(items))
    return f"""# What I check when the {clip.replace('lookup', 'look-up')} GIF comes back ({a['title']}, {H})

{body}

If it passes: import it (`python scripts/assets/animals/import_frames.py result.gif --animal {animal} --clip {clip} --heading {H} --preview preview.png`, look at the preview: placeholder on top, the new clip below), then the other two clips, then the other headings (each its own clip: never mirrored).
If a clip fails, say which numbers and ask ChatGPT for the fix in words ("keep the camera still", "walk in place", "flat grey background, no shadow"); the first try rarely gets all of them.
"""


def render_stills(animal, headings, out_dir, canvas=1024, fill=0.80, size=1600, bg=BG):
    """the animal standing at each heading, rendered from its Idol splat (GPU), on the flat grey: <out_dir>/<animal>-<HEADING>.png"""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build
    from model import load_aligned
    from repair import repair
    M = repair(load_aligned(animal)); P = build.Pose(M); frames = build.build_frames(P)
    p, cov = build.pose_frame(P, frames[6])  # the look-up clip's last frame: the head up, standing
    out_dir.mkdir(parents=True, exist_ok=True)
    for H in headings:
        lit, a, *_ = build.render_heading(M, p, cov, build.NAMES.index(H), M.col, M.op, p[:, 2], size=size)
        im = build.to_img(lit, a); bb = im.getbbox(); im = im.crop(bb)
        f = fill * canvas / max(im.size); im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
        cv = Image.new('RGBA', (canvas, canvas), bg + (255,)); cv.alpha_composite(im, ((canvas - im.width) // 2, (canvas - im.height) // 2 + canvas // 20))
        cv.convert('RGB').save(out_dir / f'{animal}-{H}.png'); print('ref', out_dir / f'{animal}-{H}.png', flush=True)


def pose_guide(animal, clip, H, out, bg, scale=1.6):
    """the placeholder's frames of the clip at the heading, side by side on the flat grey, as a strip"""
    art = REPO / 'art' / 'animals' / animal; js = json.loads((art / 'sheet.json').read_text()); sh = Image.open(art / 'sheet.webp').convert('RGBA')
    FW, FH = js['frameWidth'], js['frameHeight']; c = js['clips'][clip if clip != 'lookup' else 'lookup']; row = HEADINGS.index(H)
    cw, ch = round(FW * scale), round(FH * scale); strip = Image.new('RGBA', (cw * c['n'], ch), bg + (255,))
    for i in range(c['n']):
        cell = sh.crop(((c['start'] + i) * FW, row * FH, (c['start'] + i) * FW + FW, row * FH + FH)).resize((cw, ch), Image.LANCZOS); strip.alpha_composite(cell, (i * cw, 0))
    strip.convert('RGB').save(out)


def readme(out):
    """the pack's README (the brown cow is the worked example); the folders that exist now are listed"""
    folders = sorted(d.name for d in Path(out).iterdir() if d.is_dir() and d.name != 'stills' and (d / 'PROMPT.md').exists())
    ex = 'cow-brown'
    return f"""# T309 ChatGPT pack: farm animals (cows, horses, sheep)

The owner, 2026-11-08: "farm animals must go to the chatgpt AI to generate the animations". The animals' frames in the game now are Idol placeholders; ChatGPT's clips replace
them one heading and clip at a time. The runtime (herds, movers, atlas pack) is final and waits for the art. Notes: `docs/art/ANIMALS-CHATGPT.md` in the repo.
Folders here (an animal, a clip, a heading; SE has no suffix): {', '.join(folders) if folders else '(none yet)'}.
Start with the brown cow: `{ex}-walk`, `{ex}-graze`, `{ex}-lookup`, all at SE (the nose down-right).

## One clip, start to finish (the walk of the brown cow as the example)
1. Open the clip's folder (`{ex}-walk`). In ChatGPT's GIF generator upload `ref.png` then `camera.png` (in that order: image 1 is the look, image 2 the camera),
   and paste the text under "Paste this prompt" in `PROMPT.md`.
2. Check the GIF against `CHECKS.md`. Ask for fixes in words if it fails. Save the good one as `result.gif` in that folder.
3. Try the import (nothing is written with --dry-run; the preview has the placeholder on top and the new clip below), from the repo root (branch arena/T309-farm-animals, PR #1000):
   `python scripts/assets/animals/import_frames.py {out}/{ex}-walk/result.gif --animal {ex} --clip walk --heading SE --preview {out}/{ex}-walk/preview.png --dry-run`
   (add `--cut-shadow` if a ground shadow came with the animal; `--bg r,g,b` if the grey is not flat; `--tol 40` for a noisy background).
4. Happy: run it again without `--dry-run`: it writes the cells into `art/animals/{ex}/sheet.webp` + `sheet.json`. Do the walk first and pass its printed scale (`--scale 0.58`)
   to graze and look-up if their own scales differ by more than 5%.
5. When a heading or an animal is done, from the repo root: `bash E:/ClaudeTemp/heavy.sh node scripts/assets/prep-animals.mjs` packs the sheets into the atlas pages (about 4 minutes).

## What the game needs from each clip (frames, in the sheet's columns)
| clip | frames | game speed | loops | notes |
| --- | --- | --- | --- | --- |
| walk | 8 | 6 frames a second | yes | a walk IN PLACE (the game moves the animal) |
| graze | 4 | 1.4 frames a second | yes | the main idle: head down, a slow nod and chew |
| look-up | 3 | 4.5 frames a second | no | the head coming up; the game plays it backwards to put the head down |
A GIF with other frame counts is fine: the importer picks the frames evenly (a last frame that repeats the first is dropped).

## The other headings and animals
Each of the 8 headings is its own clip (SE S SW W NW N NE E; the nose on screen, SE is down-right): **never mirror**, the sun is at the upper right and the sprites are lit.
`python scripts/assets/animals/chatgpt_pack.py --animal {ex} --headings all --render` makes the 8 stills and a folder per clip and heading (through `bash E:/ClaudeTemp/heavy.sh`: it uses the GPU).
For another animal: `--animal horse-bay` etc. (7 animals: {', '.join(ANIMALS)}). The camera picture of each:
`node scripts/dev/animal-camera-shot.mjs --base http://127.0.0.1:5188/ --animal <id> --out camera-<id>.png` (a dev server; through the lock), then `--camera camera-<id>.png` here.
For a white or pale animal (the white sheep, the grey horse) ask ChatGPT for a flat colour that is not near its coat (a flat mid blue, #4A78C8) instead of light grey: the importer keys any flat colour.
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0]); ap.add_argument('--animal', required=True); ap.add_argument('--headings', default='SE')
    ap.add_argument('--clips', default='walk,graze,lookup'); ap.add_argument('--out', default='E:/ClaudeTemp/T309/chatgpt'); ap.add_argument('--camera', default='')
    ap.add_argument('--render', action='store_true'); ap.add_argument('--bg', default='217,217,217'); a = ap.parse_args()
    if a.animal not in ANIMALS: sys.exit(f'animals: {", ".join(ANIMALS)}')
    heads = HEADINGS if a.headings == 'all' else a.headings.split(','); clips = a.clips.split(','); bg = tuple(int(v) for v in a.bg.split(','))
    out = Path(a.out); stills = out / 'stills'
    for H in heads:
        if H not in HEADINGS: sys.exit(f'headings: {HEADINGS}')
    if a.render: render_stills(a.animal, heads, stills, bg=bg)
    for H in heads:
        ref = stills / f'{a.animal}-{H}.png'
        if not ref.exists(): print(f'no still {ref}: run with --render (GPU)'); continue
        for clip in clips:
            d = out / (f'{a.animal}-{clip}' + ('' if H == 'SE' else f'-{H}')); d.mkdir(parents=True, exist_ok=True)
            shutil.copy(ref, d / 'ref.png')
            if a.camera and Path(a.camera).exists(): shutil.copy(a.camera, d / 'camera.png')
            elif not (d / 'camera.png').exists(): print(f'  (no camera.png in {d.name}: pass --camera)')
            pose_guide(a.animal, clip, H, d / 'pose-guide.png', bg)
            (d / 'PROMPT.md').write_text(prompt_md(a.animal, clip, H, bg), encoding='utf-8'); (d / 'CHECKS.md').write_text(checks_md(a.animal, clip, H), encoding='utf-8')
            print('wrote', d)
    (out / 'README.md').write_text(readme(out), encoding='utf-8'); print('wrote', out / 'README.md')


if __name__ == '__main__':
    main()
