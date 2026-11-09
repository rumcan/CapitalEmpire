"""land.relief.heightmap: a height array as a grey PNG (native, PIL and numpy). The input is a raw little-endian float32 file or a JSON file with a "height" list."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from fractal.holon import OUT, Fn, Holon


def load_height(path: str) -> np.ndarray:
    """the square height grid from a raw float32 file or a JSON file ({"height": [...]} or a bare list)"""
    p = Path(path)
    if p.suffix.lower() == ".json":
        d = json.loads(p.read_text(encoding="utf8"))
        a = np.asarray(d["height"] if isinstance(d, dict) else d, dtype=np.float32)
    else:
        a = np.fromfile(p, dtype="<f4")
    side = int(round(a.size ** 0.5))
    return a.reshape(side, side)


def heightmap(path: str, knobs=None) -> dict:
    """a height grid as a grey PNG, black at its lowest sample and white at its highest, scaled up nearest-neighbour"""
    scale = int((knobs or {}).get("scale", 4))
    a = load_height(path)
    lo, hi = float(a.min()), float(a.max())
    g = np.clip((a - lo) / max(hi - lo, 1e-6), 0, 1)
    img = Image.fromarray((g * 255).astype(np.uint8), "L").resize((a.shape[1] * scale, a.shape[0] * scale), Image.NEAREST)
    target = OUT / (Path(path).stem + "-heightmap.png")
    img.save(target)
    return {"path": str(target), "side": int(a.shape[0]), "min_m": round(lo, 2), "max_m": round(hi, 2)}


HOLON = Holon(
    id="land.relief.heightmap", rung=3, title="Heightmap picture",
    purpose="See a terrain's height as a picture: the valley and its hills, before anything is painted on it.",
    requires=[
        "heightmap(path) reads a square height grid (128 by 128 for a game terrain) and writes a grey PNG under OUT.",
        "The PNG maps the lowest sample to black and the highest to white.",
    ],
    owns=[],
    files=[],
    dynamics=[Fn(name="Terrain.height", at="src/game/terrain/types.ts:24", does="the height grid the picture is made from (metres, HS by HS samples)", sig="interface Terrain")],
    inputs=["a raw float32 file or a JSON file with the height list"], outputs=["a grey PNG path under OUT and its min and max in metres"],
    tests=["fractal: python fractal/fractal.py run land.relief.heightmap path=<file>"],
    below=["land.terrain.generate"], above=["land.relief.hillshade"],
    dual="MISSING: the picture is a new file each run; nothing in the game is changed",
    seams=["reads Terrain.height only; writes nothing the game reads"],
    rules=["sun upper right, shadows 145 degrees"],
    impl="native", fn=heightmap, params={"path": "str, a raw float32 height file or a JSON file with the height list"},
    steer={"scale": 4},
)
