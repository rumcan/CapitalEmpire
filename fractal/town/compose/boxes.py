"""town.compose.boxes: draw a lot's composition as a PNG: the ground patches (drive, walk, lot, yard, bed), the house and garage boxes, and the props as dots."""
import json
from pathlib import Path

from PIL import Image, ImageDraw

from fractal.holon import OUT, Fn, Holon

STEER = {
    "scale": 24, "margin": 1.0, "max_px": 2048,
    "bg": [236, 232, 220], "house": [200, 60, 50], "garage": [230, 150, 40],
    "tex": {"dirt": [150, 110, 70], "gravel": [170, 165, 150], "concrete": [185, 185, 180], "asphalt": [70, 70, 75],
            "lotAsphalt": [80, 80, 85], "paving": [200, 190, 170], "pad": [190, 170, 130], "rockyDirt": [130, 115, 95],
            "rockyDirtAlt": [125, 110, 90]},
    "prop": {"tree": [40, 120, 50], "bush": [90, 150, 70], "landscape": [90, 150, 70], "car": [40, 90, 200],
             "fence": [120, 80, 40], "chainlink": [120, 80, 40], "default": [90, 90, 90]},
}


def _kind(prop_id, prop_colours):
    """the prop's colour by the first keyword its id holds (tree, bush, car, fence ...), else the default"""
    for key in prop_colours:
        if key != "default" and key in prop_id:
            return prop_colours[key]
    return prop_colours["default"]


def draw_composition(path, knobs=None):
    """draw one composition JSON ({ground: [{pts, tex}], props: [{id, x, y}], anchors: {boxes, house, garages}}) to a PNG in OUT; returns its path and counts"""
    k = {**STEER, **(knobs or {})}
    c = json.loads(Path(path).read_text(encoding="utf-8"))
    ground = c.get("ground", [])
    props = c.get("props", [])
    anchors = c.get("anchors") or {}
    boxes = anchors.get("boxes", [])
    xs, ys = [], []
    for g in ground:
        xs += g["pts"][0::2]
        ys += g["pts"][1::2]
    for p in props:
        xs.append(p["x"])
        ys.append(p["y"])
    for b in boxes:
        xs += [b[0], b[2]]
        ys += [b[1], b[3]]
    if not xs:
        raise ValueError(f"{path}: the composition has no ground, props or boxes")
    m = k["margin"]
    x0, y0, x1, y1 = min(xs) - m, min(ys) - m, max(xs) + m, max(ys) + m
    s = min(k["scale"], k["max_px"] / max(x1 - x0, y1 - y0))
    W, H = max(1, int((x1 - x0) * s)), max(1, int((y1 - y0) * s))
    img = Image.new("RGB", (W, H), tuple(k["bg"]))
    d = ImageDraw.Draw(img)

    def px(x, y):
        return ((x - x0) * s, (y - y0) * s)

    for g in ground:
        pts = g["pts"]
        poly = [px(pts[i], pts[i + 1]) for i in range(0, len(pts) - 1, 2)]
        if len(poly) >= 3:
            d.polygon(poly, fill=tuple(k["tex"].get(g.get("tex"), [160, 160, 160])))
    for i, b in enumerate(boxes):
        colour = tuple(k["house"] if i == 0 else k["garage"])
        a, bb = px(b[0], b[1]), px(b[2], b[3])
        d.rectangle([a, bb], outline=colour, width=max(1, int(s / 8)))
    r = max(1.5, s / 6)
    for p in props:
        cx, cy = px(p["x"], p["y"])
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tuple(_kind(p.get("id", ""), k["prop"])))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{Path(path).stem}-composition.png"
    img.save(out)
    return {"path": str(out), "size": [W, H], "ground": len(ground), "props": len(props), "boxes": len(boxes)}


HOLON = Holon(
    id="town.compose.boxes", rung=3, title="Draw a composition as boxes (PNG)",
    purpose="Draw one lot's composition JSON as a picture: its ground patches, its house and garage boxes, and its props as dots.",
    requires=[
        "A composition JSON holds ground patches as flat pts lists in tiles, props with x and y, and anchors with boxes (src/game/lots/compose-core.ts:32).",
        "The PNG is written under the fractal output folder, never over the input.",
    ],
    files=[],
    dynamics=[
        Fn(name="Composition", at="src/game/lots/compose-core.ts:32", does="the shape the picture is drawn from: props, ground, anchors", sig="interface Composition { props, ground, anchors? }"),
    ],
    inputs=["a composition JSON path"],
    outputs=["a PNG under OUT", "counts of ground, props and boxes"],
    tests=["fractal: python fractal/fractal.py run town.compose.boxes path=<composition.json>"],
    above=["town.compose.lot"], dual="none: a picture is written beside the others; delete the PNG to undo",
    seams=["the lot composition the lab exports (dev, core)"],
    rules=["lit sprites are never mirrored", "no flat colour washes"],
    impl="native", fn=draw_composition, steer=STEER,
    port="",
    params={"path": "str, the composition JSON file"},
)
