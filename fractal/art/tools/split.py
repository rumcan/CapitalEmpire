"""art.tools.split: split a 2x2 sheet into its four cells (native): top-left, top-right, bottom-left, bottom-right, each trimmed by the steer margin."""
from PIL import Image

from fractal.holon import OUT, Fn, Holon

STEER = {"trim": 0}
CELLS = ("tl", "tr", "bl", "br")


def split_2x2(path: str, knobs: dict | None = None) -> dict:
    """four cells of a 2x2 sheet: writes OUT/split-<stem>-<tl|tr|bl|br>.png, each inset by trim px, and returns the paths"""
    k = knobs or STEER
    im = Image.open(path).convert("RGBA")
    w, h, t = im.width // 2, im.height // 2, k["trim"]
    boxes = [(0, 0), (w, 0), (0, h), (w, h)]
    stem = path.replace(chr(92), "/").split("/")[-1].rsplit(".", 1)[0]
    OUT.mkdir(parents=True, exist_ok=True)
    out = []
    for (x, y), name in zip(boxes, CELLS):
        p = OUT / f"split-{stem}-{name}.png"
        im.crop((x + t, y + t, x + w - t, y + h - t)).save(p)
        out.append(str(p))
    return {"cells": out, "size": [w - 2 * t, h - 2 * t]}


HOLON = Holon(
    id="art.tools.split", rung=3, title="2x2 sheet split",
    purpose="Cut a four-picture sheet into its four pictures, one per view (for example a set of four facings).",
    requires=["split_2x2 cuts the sheet at its half width and half height into four cells, in the order tl, tr, bl, br."],
    owns=["nothing: it writes four new pictures under OUT"],
    files=[],
    dynamics=[Fn(name="split_2x2", at="art/tools/split.py:1", does="cuts a 2x2 sheet into four cell pictures (a Python function, not a game function)", sig="split_2x2(path, knobs)")],
    inputs=["a 2x2 sheet PNG or WebP"],
    outputs=["four cell PNGs under OUT", "the cell paths and size"],
    tests=["fractal: python fractal/fractal.py run art.tools.split path=<png>"],
    below=[], above=["art.tools"],
    dual=None,
    impl="native", fn=split_2x2, steer=dict(STEER),
    params={"path": "str, a 2x2 sheet"},
)
