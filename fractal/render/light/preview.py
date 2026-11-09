"""render.light.preview: a sun-direction shading preview of a height array (native, PIL and numpy).

The sun is at the upper right and shadows fall at 145 degrees (screen angles, y down): the light comes from the opposite direction. A cell
is shaded by the dot product of its surface normal with that light; the picture is the ambient plus the lit share. Input: a PNG (a grey
height, 0 to 255 scaled to relief_m) or a JSON file (a list of rows, or {"h": rows}, in metres)."""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from fractal.holon import OUT, Fn, Holon

STEER = {"shadow_deg": 145.0, "elevation_deg": 45.0, "relief_m": 60.0, "cell_m": 2.0, "ambient": 0.35}


def load_height(path: str, relief_m: float) -> np.ndarray:
    """a height array in metres: a grey PNG scaled to relief_m, or a JSON list of rows"""
    p = Path(path)
    if p.suffix.lower() == ".json":
        d = json.loads(p.read_text(encoding="utf-8"))
        return np.asarray(d["h"] if isinstance(d, dict) else d, dtype=float)
    return np.asarray(Image.open(p).convert("L"), dtype=float) / 255.0 * relief_m


def sun_preview(path: str, knobs: dict | None = None) -> dict:
    """the shading picture of a height array with the sun at the upper right: writes OUT/sun-preview.png and returns its path and the sun vector"""
    k = knobs or STEER
    h = load_height(path, k["relief_m"])
    gy, gx = np.gradient(h, k["cell_m"])            # gy: change down the rows, gx: change across the columns
    nx, ny, nz = -gx, gy, np.ones_like(h)           # world X is across, world Y is up (= minus the row)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    th = math.radians(k["shadow_deg"]) + math.pi    # the sun's direction: the shadow's opposite
    el = math.radians(k["elevation_deg"])
    sx, sy = math.cos(th), -math.sin(th)            # screen (y down) to world (y up)
    lx, ly, lz = math.cos(el) * sx, math.cos(el) * sy, math.sin(el)
    lit = np.clip((nx * lx + ny * ly + nz * lz) / n, 0.0, 1.0)
    shade = k["ambient"] + (1.0 - k["ambient"]) * lit
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / "sun-preview.png"
    Image.fromarray((shade * 255).astype(np.uint8), "L").save(out)
    return {"path": str(out), "sun_world": [round(lx, 4), round(ly, 4), round(lz, 4)], "shape": list(h.shape)}


HOLON = Holon(
    id="render.light.preview", rung=3, title="Sun-direction shading preview",
    purpose="Show a height array as the game's sun lights it (upper right, shadows at 145 degrees), to check a relief before it is used.",
    requires=[
        "The sun is at the upper right: the light's screen direction is the shadow's opposite (145 degrees, y down).",
        "The preview is a grey picture, ambient 0.35 plus the lit share, written to OUT/sun-preview.png.",
    ],
    owns=["nothing: a picture written under OUT"],
    files=[],
    dynamics=[Fn(name="sun_preview", at="render/light/preview.py:1", does="the sun-direction shading of a height array (a Python port of no game function)", sig="sun_preview(path, knobs)")],
    inputs=["a height PNG (grey, 0 to 255) or a JSON list of rows in metres"],
    outputs=["OUT/sun-preview.png", "the sun vector and the shape"],
    tests=["fractal: python fractal/fractal.py run render.light.preview path=<png or json>"],
    below=[], above=[],
    dual=None, seams=["Height arrays from the land domain (heightmaps)"],
    rules=["sun upper right, shadows 145 degrees"],
    impl="native", fn=sun_preview, steer=dict(STEER),
    params={"path": "str, a height PNG or JSON file"},
)
