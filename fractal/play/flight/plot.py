"""play.flight.plot: Shot flight picture (T410, issue 1110). Python port steered by fractal/_steer/play.flight.plot.json."""

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

from fractal.holon import OUT, Fn, Holon

STEER = {"tile_m": 2.0, "px_per_m": 4.0, "margin_px": 24, "side_px_per_m": 4.0,
         "bg": [18, 30, 22], "ink": [245, 245, 235], "land": [240, 190, 60], "tee": [120, 200, 255]}


def plot_flight(*, path: str, knobs=None, out: str = "") -> dict:
    """a shot's flight from its JSON: a top-view PNG, and a side view when the flight gives apex_m (the shot model has no height)"""
    k = {**STEER, **(knobs or {})}
    f = json.loads(Path(path).read_text(encoding="utf-8"))
    unit = float(k["tile_m"]) if f.get("units", "tiles") == "tiles" else 1.0
    a = [float(v) for v in f["from"]]
    b = [float(v) for v in f["to"]]
    land = [float(v) for v in f["landing"]["at"]] if f.get("landing") else None
    s, mg = float(k["px_per_m"]), int(k["margin_px"])

    def xy(p):
        return ((p[0] - a[0]) * unit * s, (p[1] - a[1]) * unit * s)

    pts = [xy(p) for p in [a, b] + ([land] if land else [])]
    x0, y0 = min(p[0] for p in pts), min(p[1] for p in pts)
    W = int(max(p[0] for p in pts) - x0) + 2 * mg
    H = int(max(p[1] for p in pts) - y0) + 2 * mg

    def px(p):
        q = xy(p)
        return (q[0] - x0 + mg, q[1] - y0 + mg)

    end = land or b
    carry_m = math.dist(a, end) * unit
    dirp = Path(out) if out else OUT / f"flight-{Path(path).stem}"
    dirp.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (max(W, 2 * mg + 1), max(H, 2 * mg + 1)), tuple(k["bg"]))
    d = ImageDraw.Draw(img)
    d.line([px(a), px(end)], fill=tuple(k["ink"]), width=2)
    if land:
        d.line([px(land), px(b)], fill=tuple(k["ink"]), width=1)
    for p, c in [(a, k["tee"]), (land, k["land"]), (b, k["ink"])]:
        if p is not None:
            x, y = px(p)
            d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=tuple(c))
    top = dirp / "top.png"
    img.save(top)
    side = None
    if f.get("apex_m") is not None and carry_m > 0:
        apex = float(f["apex_m"])
        sp = float(k["side_px_per_m"])
        sw, sh = int(carry_m * sp) + 2 * mg, int(apex * sp) + 2 * mg
        simg = Image.new("RGB", (max(sw, 2 * mg + 1), max(sh, 2 * mg + 1)), tuple(k["bg"]))
        sd = ImageDraw.Draw(simg)
        N = 64
        line = []
        for i in range(N + 1):
            t = i / N
            line.append((t * carry_m * sp + mg, sh - mg - 4 * apex * t * (1 - t) * sp))
        sd.line(line, fill=tuple(k["ink"]), width=2)
        sd.line([(mg, sh - mg), (sw - mg, sh - mg)], fill=tuple(k["land"]), width=1)
        side = dirp / "side.png"
        simg.save(side)
    note = "top view only: the flight has no apex_m" if side is None else "top and side view"
    return {"top": str(top), "side": str(side) if side else None, "carry_m": round(carry_m, 1), "note": note}


HOLON = Holon(
    id="play.flight.plot", rung=3, title="Shot flight picture",
    purpose="Plots one shot's flight from its JSON as a top-view PNG, and a side view when the flight has an apex.",
    requires=[
        "plot_flight writes a top-view PNG of a shot from its flight JSON (from, landing.at, to) under the fractal output folder.",
        "The side view is drawn only when the flight gives apex_m: the shot model has no height (a finding, see dual).",
    ],
    files=[],
    dynamics=[Fn(name="hitShot", at="src/game/golf/play/shot.ts:144", does="the flight this plots: from, landing and to (the JSON's source)",
                 sig="(r, sk, lie, from, aim, club, view, mod=None)")],
    inputs=["a flight JSON path"], outputs=["{top, side, carry_m, note}"],
    tests=["fractal: python fractal/fractal.py run play.flight.plot path=<flight.json>"],
    below=["play.flight.shot"], above=["ui"],
    dual="MISSING: the shot model has no altitude, so the side view needs apex_m from a flight the game does not yet write",
    seams=["flight JSON: {from:[x,y], to:[x,y], landing:{at:[x,y]}, apex_m?, units?}"],
    rules=[],
    impl="native", fn=plot_flight, params={"path": "str, the flight JSON"}, steer=STEER, port="",
)
