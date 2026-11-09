"""people.animation.clips: Clip frames as a contact sheet (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

from pathlib import Path

from PIL import Image

from fractal.holon import OUT


def contact_sheet(folder: str, knobs: dict) -> dict:
    """a contact sheet of a clip's frames: the PNG and WEBP files of a folder in name order, cols to a row"""
    files = sorted(p for p in Path(folder).iterdir() if p.suffix.lower() in (".png", ".webp"))
    if not files:
        raise FileNotFoundError(f"no frames in {folder}")
    cell, cols = int(knobs["cell"]), max(1, int(knobs["cols"]))
    rows = -(-len(files) // cols)
    sheet = Image.new("RGBA", (cols * cell, rows * cell), tuple(knobs["background"]))
    for i, p in enumerate(files):
        im = Image.open(p).convert("RGBA")
        im.thumbnail((cell, cell))
        sheet.alpha_composite(im, ((i % cols) * cell + (cell - im.width) // 2, (i // cols) * cell + (cell - im.height) // 2))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"people-clips-{Path(folder).name}.png"
    sheet.save(out)
    return {"path": str(out), "frames": len(files), "cols": cols, "rows": rows}

HOLON = Holon(
    id='people.animation.clips',
    rung=3,
    title='Clip frames as a contact sheet',
    purpose="A contact sheet of one clip's frames from a folder, to see a clip before it is drawn.",
    requires=['A clip is a run of its sheet row: frames start to start+n-1, in order (library.ts PeopleClip).', 'SPECTATOR_CLIPS and GOLFER_CLIPS name their clips: idle, walk, clap, cheer, sit, sit_clap; and idle, walk, golf_drive, golf_putt.'],
    dynamics=[
        Fn(name='SPECTATOR_CLIPS', at='src/game/library.ts:1064', does="the spectators' clips: start, n, times, loop", sig='Record<..., PeopleClip>'),
        Fn(name='GOLFER_CLIPS', at='src/game/library.ts:1077', does="the golfers' clips", sig='Record<..., PeopleClip>')],
    inputs=['a folder of frame PNG or WEBP files, in name order'],
    outputs=['a sheet PNG path and its frame count'],
    tests=['crowdview.test.ts', 'golf-putt-clip.test.ts'],
    below=['art'],
    above=['people.crowd.view'],
    dual='derived; nothing to undo',
    rules=['no visible tiling'],
    impl='native',
    params={'folder': 'str, a folder of frame images'},
    steer={'cols': 8, 'cell': 128, 'background': [0, 0, 0, 0]},
    fn=contact_sheet,
)
