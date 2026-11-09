"""course.mowing.preview: a PNG of mowing bands, light and dark, from a band look (a StripeLook as JSON, or the steer knobs). Native: PIL and numpy."""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from fractal.holon import OUT, Holon

STEER = {"w": 5.0, "angle": 0.0, "lc": "#e8efc0", "dc": "#5a7a3a", "px_per_tile": 12, "size": 512}


def _rgb(hex_: str) -> np.ndarray:
    """a '#rrggbb' colour as a (3,) uint8 array"""
    h = hex_.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.uint8)


def mow_preview(look: str = "", knobs: dict | None = None) -> dict:
    """the band picture: bands `w` tiles wide at `angle` degrees, alternate light (lc) and dark (dc); look is an optional StripeLook JSON path"""
    k = {**STEER, **(knobs or {})}
    if look:
        src = json.loads(Path(look).read_text(encoding="utf-8"))
        for key in ("w", "angle", "lc", "dc"):
            if key in src:
                k[key] = src[key]
    n = int(k["size"])
    band = max(1.0, float(k["w"]) * float(k["px_per_tile"]))
    a = math.radians(float(k["angle"]))
    ux, uy = -math.sin(a), math.cos(a)                     # the band normal, as course-stripes.ts holeStripeLegs lays it
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float64)
    band_index = np.floor((xs * ux + ys * uy) / band).astype(np.int64) % 2
    img = np.where(band_index[..., None] == 0, _rgb(k["lc"]), _rgb(k["dc"])).astype(np.uint8)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "mow-preview.png"
    Image.fromarray(img, "RGB").save(path)
    return {"path": str(path), "band_px": band, "bands_across": round(n / band, 2), "angle": float(k["angle"]), "light": k["lc"], "dark": k["dc"]}


HOLON = Holon(
    id="course.mowing.preview", rung=3, title="Mowing-pattern preview",
    purpose="A picture of the mowing bands a look lays: light and dark stripes of a set width at a set angle, for a designer to see before a hole is mown.",
    requires=[
        "A mowing preview alternates the light and dark bands, each as wide as the band width in tiles times the pixels per tile.",
        "The preview's bands are at the angle given, measured as holeStripeLegs lays them (the normal is (-sin a, cos a)).",
    ],
    inputs=["a StripeLook JSON path (w, angle, lc, dc), or the steer knobs"], outputs=["OUT/mow-preview.png", "the band size and the angle"],
    tests=["fractal: python fractal/fractal.py run course.mowing.preview"],
    below=["course.mowing.bands"], above=["course.mowing"],
    dual="none: a picture is written, and the next run overwrites it",
    impl="native", fn=mow_preview, params={"look": "str, a StripeLook JSON path (optional)", "knobs": "the steer knobs (filled by the runner)"},
    steer=STEER,
)
