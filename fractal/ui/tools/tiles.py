"""ui.tools.tiles: Tool tiles as a contact sheet (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

import math
import re

from PIL import Image, ImageDraw

from fractal.holon import OUT, REPO


def tool_tiles_sheet(knobs: dict) -> dict:
    """a contact sheet of the tool tiles named in tool-tiles.ts (TOOL_TILES_V1 and V2), with the names that have no webp"""
    src = (REPO / "src/ui/tool-tiles.ts").read_text(encoding="utf-8")
    blocks = re.findall(r"^export const TOOL_TILES_V[12] = \[(.*?)\]", src, re.M | re.S)
    names = re.findall(r"'([a-z-]+)'", "".join(blocks))
    tiles = REPO / "src/assets/ui/tiles"
    cell, cols, lh = int(knobs["cell"]), int(knobs["cols"]), int(knobs["label_h"])
    rows = math.ceil(len(names) / cols)
    sheet = Image.new("RGBA", (cols * cell, rows * (cell + lh)), tuple(knobs["background"]))
    d = ImageDraw.Draw(sheet)
    missing = []
    for i, n in enumerate(names):
        x, y = (i % cols) * cell, (i // cols) * (cell + lh)
        p = tiles / f"{n}.webp"
        if p.exists():
            im = Image.open(p).convert("RGBA")
            im.thumbnail((cell, cell))
            sheet.alpha_composite(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        else:
            missing.append(n)
        d.text((x + 2, y + cell + 2), n, fill=tuple(knobs["ink"]))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / "ui-tool-tiles.png"
    sheet.save(out)
    return {"path": str(out), "tiles": len(names), "missing": missing}

HOLON = Holon(
    id='ui.tools.tiles',
    rung=3,
    title='Tool tiles as a contact sheet',
    purpose='The painted tool tiles every menu icon uses, drawn as one sheet with a check for any missing tile.',
    requires=['Every name in TOOL_TILES has a webp in src/assets/ui/tiles (tool-tiles.ts TOOL_TILES_V1 and V2).', "tileUrl gives a tile's picture by its name (tool-tiles.ts:11)."],
    files=['src/ui/tool-tiles.ts'],
    dynamics=[
        Fn(name='tileUrl', at='src/ui/tool-tiles.ts:11', does="a tile's picture URL", sig='(t: ToolTile) => string | undefined'),
        Fn(name='TOOL_TILES', at='src/ui/tool-tiles.ts:7', does='every tool tile', sig='readonly ToolTile[]')],
    inputs=['the tile names in tool-tiles.ts; the tile files'],
    outputs=['a sheet PNG and the names with no file'],
    tests=['ui-tool-tiles-prep.test.ts'],
    below=['art'],
    above=['ui.tools.place', 'ui.tools.paint'],
    dual='derived; nothing to undo',
    rules=['new art used everywhere'],
    impl='native',
    params={'knobs': 'steer values'},
    steer={'cell': 96, 'cols': 8, 'label_h': 18, 'background': [24, 28, 32, 255], 'ink': [255, 255, 255, 255]},
    fn=tool_tiles_sheet,
)
