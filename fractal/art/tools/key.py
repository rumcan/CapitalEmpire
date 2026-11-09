"""art.tools.key: keying a magenta sheet to alpha (native). Magenta-ness is min(r, b) minus g; a pixel's alpha is 1 minus its share of the
background's magenta-ness, and its colour is un-mixed from the background colour (the port of the game's key-magenta idea, one picture at a time)."""
import numpy as np
from PIL import Image

from fractal.holon import OUT, Fn, Holon

STEER = {"floor": 0.02, "min_bg": 40.0}


def key_magenta(path: str, knobs: dict | None = None) -> dict:
    """the picture with its magenta background keyed to alpha: writes OUT/keyed-<stem>.png; fails when the border is not magenta"""
    k = knobs or STEER
    im = np.asarray(Image.open(path).convert("RGB"), dtype=float)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mg = np.minimum(r, b) - g
    border = np.concatenate([im[0].ravel(), im[-1].ravel(), im[:, 0].ravel(), im[:, -1].ravel()]).reshape(-1, 3)
    bmg = np.concatenate([mg[0], mg[-1], mg[:, 0], mg[:, -1]])
    bg_score, bg_col = float(np.median(bmg)), np.median(border, axis=0)
    if bg_score < k["min_bg"]:
        return {"path": path, "keyed": False, "why": f"border magenta-ness {bg_score:.1f} is below {k['min_bg']}"}
    a = np.clip(1.0 - mg / bg_score, 0.0, 1.0)
    a = np.where(a < k["floor"], 0.0, a)
    safe = np.maximum(a, 1e-6)[..., None]
    c = np.where(a[..., None] > 0, (im - (1 - a[..., None]) * bg_col) / safe, im)
    rgba = np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.uint8)
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"keyed-{path.replace(chr(92), '/').split('/')[-1].rsplit('.', 1)[0]}.png"
    Image.fromarray(rgba, "RGBA").save(out)
    return {"path": str(out), "keyed": True, "bg_score": round(bg_score, 1), "clear": round(float((a == 0).mean()), 3)}


HOLON = Holon(
    id="art.tools.key", rung=3, title="Magenta key",
    purpose="Turn a picture painted on flat magenta into real alpha, so the sprite has a true transparent background.",
    requires=[
        "A pixel's magenta-ness is min(r, b) minus g: about 255 for #FF00FF, about 0 for whites, greys and reds.",
        "The alpha is 1 minus the pixel's magenta-ness over the border's median; under the floor (0.02) it is 0; the colour is un-mixed from the background colour.",
        "A picture whose border is not magenta (median magenta-ness under 40) is not keyed.",
    ],
    owns=["nothing: it writes a new RGBA picture under OUT"],
    files=[],
    dynamics=[Fn(name="key_magenta", at="art/tools/key.py:1", does="keys a magenta-background picture to alpha (a Python port of the idea in scripts/assets/key-magenta.mjs)", sig="key_magenta(path, knobs)")],
    inputs=["a PNG or WebP painted on magenta"],
    outputs=["OUT/keyed-<stem>.png (RGBA)", "keyed, the background score and the clear share"],
    tests=["tests/key-magenta.test.ts", "fractal: python fractal/fractal.py run art.tools.key path=<png>"],
    below=[], above=["art.tools"],
    dual="the original picture is untouched (the key writes a new file)",
    impl="native", fn=key_magenta, steer=dict(STEER),
    params={"path": "str, the magenta-background picture"},
)
