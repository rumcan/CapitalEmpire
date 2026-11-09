"""art.alpha_check: a still sheet must have a real transparent background (the runner's opaque check, anim-bridge.mjs opaqueCheck, 2026-11-09)."""
from pathlib import Path

import numpy as np
from PIL import Image

from fractal.holon import Fn, Holon


def alpha_check(path: str, corner: int = 40, step: int = 4) -> dict:
    """the share of see-through pixels in the four corners of a picture: a sheet passes when more than half are see-through"""
    a = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3]
    h, w = a.shape
    boxes = [a[0:corner:step, 0:corner:step], a[0:corner:step, w - corner:w:step], a[h - corner:h:step, 0:corner:step], a[h - corner:h:step, w - corner:w:step]]
    clear = float(np.mean(np.concatenate([b.ravel() for b in boxes]) < 128))
    return {"path": str(Path(path)), "clear": round(clear, 3), "pass": clear > 0.5}


HOLON = Holon(
    id="art.alpha_check", rung=2, title="Transparency check",
    purpose="Reject a ChatGPT sheet whose background is a drawn checkerboard or a flat colour instead of real transparency.",
    requires=["A still sheet passes only when more than half of the pixels in its four 40-pixel corners are see-through (alpha below 128)."],
    dynamics=[Fn(name="opaqueCheck", at="F:/Art/newArt/animations/runner/anim-bridge.mjs", does="checks each written still sheet; re-queues an opaque one with a transparency note")],
    inputs=["a PNG path"], outputs=["{clear, pass}"],
    tests=["fractal: python fractal/fractal.py run art.alpha_check path=<png>"],
    above=["art"], dual="the re-queued job (a new sheet replaces the rejected one)",
    impl="native", fn=alpha_check, params={"path": "str, the PNG to check"},
)
