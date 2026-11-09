"""land.relief.slope: the slope of the height field (port of terrain-paint.ts slopeField), with slope bands as a PNG (native)."""
from pathlib import Path

import numpy as np
from PIL import Image

from fractal.holon import OUT, Fn, Holon
from fractal.land.relief.heightmap import load_height


def slope(path: str, knobs=None) -> dict:
    """the gradient length per sample (metres per metre), banded by the knobs and drawn as a PNG, one colour per band"""
    k = knobs or {}
    hs, exag, sc = int(k.get("hstep", 8)), float(k.get("exag", 1.0)), int(k.get("scale", 4))
    h = load_height(path)
    H, W = h.shape
    ix = np.arange(W)
    i0, i1 = np.maximum(0, ix - 1), np.minimum(W - 1, ix + 1)
    jy = np.arange(H)
    j0, j1 = np.maximum(0, jy - 1), np.minimum(H - 1, jy + 1)
    gx = (h[:, i1] - h[:, i0]) / ((i1 - i0) * hs * 2)[None, :]
    gy = (h[j1, :] - h[j0, :]) / ((j1 - j0) * hs * 2)[:, None]
    s = np.hypot(gx, gy) * exag
    bands = [float(b) for b in k.get("bands", [0.3, 0.6, 1.2])]
    idx = np.digitize(s, bands)
    cols = np.array(k.get("band_colours", [[120, 170, 90], [200, 180, 90], [160, 110, 70], [90, 80, 70]]), np.uint8)
    img = Image.fromarray(cols[np.minimum(idx, len(cols) - 1)], "RGB").resize((W * sc, H * sc), Image.NEAREST)
    target = OUT / (Path(path).stem + "-slope.png")
    img.save(target)
    shares = [round(float((idx == b).mean()), 3) for b in range(len(bands) + 1)]
    return {"path": str(target), "max_slope": round(float(s.max()), 3), "mean_slope": round(float(s.mean()), 3), "band_edges": bands, "band_shares": shares}


HOLON = Holon(
    id="land.relief.slope", rung=3, title="Slope field and slope bands",
    purpose="Say how steep each sample of the ground is, and show the slope bands as a picture, so the game can band the slopes and fade bare rock onto the steep faces.",
    requires=[
        "slope(path) returns, per height sample, the length of the height gradient (metres per metre), 0 on flat ground.",
        "The band edges are steer knobs; the game rock fade (rockAlpha, terrain-paint.ts:182) starts past a slope of about 1.2.",
    ],
    owns=[],
    files=[],
    dynamics=[Fn(name="slopeField", at="src/game/terrain-paint.ts:169", does="the slope per height sample from the height field gradient (this port follows it)", sig="slopeField(height: Float32Array): Float32Array")],
    inputs=["a raw float32 or JSON height grid"], outputs=["max, mean and band shares, and a band PNG under OUT"],
    tests=["fractal: python fractal/fractal.py run land.relief.slope path=<file>", "tests/terrain-paint.test.ts (the TS original)"],
    below=["land.relief.heightmap"], above=["land.relief.paint", "land.nature.forest"],
    dual="MISSING: a computed picture; nothing to undo",
    seams=["Terrain.height read only"],
    rules=["sun upper right, shadows 145 degrees"],
    impl="native", fn=slope, params={"path": "str, a raw float32 or JSON height grid"},
    steer={"hstep": 8, "exag": 1.0, "bands": [0.3, 0.6, 1.2], "scale": 4,
           "band_colours": [[120, 170, 90], [200, 180, 90], [160, 110, 70], [90, 80, 70]]},
    port="",
)
