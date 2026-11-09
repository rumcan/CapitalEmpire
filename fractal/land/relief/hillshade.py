"""land.relief.hillshade: the game's hillshade (terrain-paint.ts shadeField) as a PNG, sun at the upper right, shadows at 145 degrees (native)."""
import math
from pathlib import Path

import numpy as np
from PIL import Image

from fractal.holon import OUT, Fn, Holon
from fractal.land.relief.heightmap import load_height

# the defaults below are the game values (SUN_SHADOW_DEG 145, HSTEP 8, EXAG 1.5, SUN_LIGHT 1.0124 and 1.05); the steer knobs override them
STEER = {"sun_deg": 145.0, "hstep": 8, "exag": 1.5, "h_horiz": 1.0124, "lz": 1.05, "scale": 4, "lit_cap": 0.12, "shadow_cap": 0.5}


def sun_light(k=None) -> tuple[float, float, float]:
    """the unit light vector (x, y, z) in tile space: the same as course-height SUN_LIGHT at the default knobs"""
    k = {**STEER, **(k or {})}
    a = math.radians(float(k["sun_deg"]))
    sx, sy = -math.cos(a), -math.sin(a)
    u, v = sx / 64, sy / 32
    x, y = (u + v) / 2, (v - u) / 2
    l = math.hypot(x, y)
    lx, ly = x / l * float(k["h_horiz"]), y / l * float(k["h_horiz"])
    n = math.hypot(lx, ly, float(k["lz"]))
    return lx / n, ly / n, float(k["lz"]) / n


def shade(h: np.ndarray, k=None) -> np.ndarray:
    """per sample: the Lambert value minus the flat ground's, so 0 is flat, below 0 in shadow, above 0 lit (shadeField, vectorised)"""
    H, W = h.shape
    k = {**STEER, **(k or {})}
    lx, ly, lz = sun_light(k)
    hstep, exag = int(k["hstep"]), float(k["exag"])
    ix = np.arange(W)
    i0, i1 = np.maximum(0, ix - 1), np.minimum(W - 1, ix + 1)
    jy = np.arange(H)
    j0, j1 = np.maximum(0, jy - 1), np.minimum(H - 1, jy + 1)
    dx = (i1 - i0) * hstep * 2
    dy = (j1 - j0) * hstep * 2
    gx = (h[:, i1] - h[:, i0]) / dx[None, :]
    gy = (h[j1, :] - h[j0, :]) / dy[:, None]
    nx, ny = -exag * gx, -exag * gy
    nl = np.sqrt(nx * nx + ny * ny + 1.0)
    return (nx * lx + ny * ly + lz) / nl - lz


def hillshade(path: str, knobs=None) -> dict:
    """the shade as a PNG over mid grey: dark blue-black where in shadow, pale where lit (shadePixel's colours and alphas)"""
    k = {**STEER, **(knobs or {})}
    h = load_height(path)
    s = shade(h, k)
    dark = s < 0
    a = np.where(dark, np.minimum(0.5, -s * 1.6), np.minimum(float(k["lit_cap"]), np.maximum(s, 0) * 0.6))
    rgb = np.where(dark[..., None], np.array([14, 10, 34], np.float32), np.array([190, 200, 230], np.float32))
    base = np.full(h.shape + (3,), 128.0, np.float32)
    out = (base * (1 - a[..., None]) + rgb * a[..., None]).clip(0, 255).astype(np.uint8)
    sc = int(k["scale"])
    img = Image.fromarray(out, "RGB").resize((h.shape[1] * sc, h.shape[0] * sc), Image.NEAREST)
    target = OUT / (Path(path).stem + "-hillshade.png")
    img.save(target)
    return {"path": str(target), "lit_share": round(float((s > 0.01).mean()), 3), "shadow_share": round(float((s < -0.01).mean()), 3), "light": [round(v, 3) for v in sun_light(k)]}


HOLON = Holon(
    id="land.relief.hillshade", rung=3, title="Hillshade picture (sun upper right)",
    purpose="See the relief the way the game lights it: the sun at the upper right, the shadows falling at 145 degrees.",
    requires=[
        "The light vector is the game's SUN_LIGHT: from the upper right of the screen, shadows at 145 degrees.",
        "hillshade(path) writes a PNG under OUT whose shadows fall on the side away from the sun, and reports the lit and shadow shares.",
        "The shading formula matches terrain-paint.ts shadeField (exaggeration 1.5, samples 8 tiles apart).",
    ],
    owns=[],
    files=[],
    dynamics=[Fn(name="shadeField", at="src/game/terrain-paint.ts:30", does="the hillshade per height sample: the value this picture draws", sig="shadeField(height: Float32Array): Float32Array")],
    inputs=["a raw float32 or JSON height grid"], outputs=["a PNG path under OUT and the lit and shadow shares"],
    tests=["fractal: python fractal/fractal.py run land.relief.hillshade path=<file>"],
    below=["land.relief.heightmap"], above=["land.relief.paint"],
    dual="MISSING: a picture only; nothing in the game reads it",
    seams=["light constants shared with ext/course-height SUN_LIGHT (keep the two in step)"],
    rules=["sun upper right, shadows 145 degrees"],
    impl="native", fn=hillshade, params={"path": "str, a raw float32 or JSON height grid"},
    steer=STEER,
)
