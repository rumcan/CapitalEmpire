"""course.osm.outline: a PNG outline of a converted course: its land (the outline, or the box w x h) and its area rings. Native: PIL."""
import json
from pathlib import Path

from PIL import Image, ImageDraw

from fractal.holon import OUT, Holon

STEER = {"px_per_tile": 4, "margin": 16, "background": "#1b2a1f", "land": "#2f4a33", "edge": "#f4f0d8",
         "area": "#8fbf6a", "hole_area": "#d9c27a"}


def course_outline(spec: str, knobs: dict | None = None) -> dict:
    """the outline PNG of a converted course JSON (a spec with w, h, optional outline and areas): the land, then each area's rings"""
    k = {**STEER, **(knobs or {})}
    s = json.loads(Path(spec).read_text(encoding="utf-8"))
    ppt = float(k["px_per_tile"]), int(k["margin"])
    w, h = float(s["w"]), float(s["h"])
    W, H = int(w * ppt[0]) + 2 * ppt[1], int(h * ppt[0]) + 2 * ppt[1]
    img = Image.new("RGB", (W, H), k["background"])
    d = ImageDraw.Draw(img)

    def px(flat: list[float]) -> list[tuple[float, float]]:
        """a flat x,y list in tiles as picture points"""
        return [(ppt[1] + flat[i] * ppt[0], ppt[1] + flat[i + 1] * ppt[0]) for i in range(0, len(flat) - 1, 2)]

    land = s.get("outline") or [0, 0, w, 0, w, h, 0, h]
    d.polygon(px(land), fill=k["land"], outline=k["edge"])
    for a in s.get("areas", []):
        for ring in a.get("rings", []):
            if len(ring) >= 6:
                colour = k["hole_area"] if a.get("hole") else k["area"]
                d.line(px(ring) + [px(ring)[0]], fill=colour, width=1)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "course-outline.png"
    img.save(path)
    return {"path": str(path), "size_px": [W, H], "areas": len(s.get("areas", [])), "land_points": len(land) // 2}


HOLON = Holon(
    id="course.osm.outline", rung=3, title="Course outline picture",
    purpose="A picture of a converted course's land and its areas, so a designer sees the shape of a real course before it is placed.",
    requires=[
        "The outline picture's size is the land's w x h tiles at px_per_tile pixels a tile, plus a margin on each side.",
        "The land is drawn from the spec's outline when it has one, otherwise as the w x h box (outlineOf, rotate.ts:40).",
        "An area ring with fewer than 3 points is not drawn.",
    ],
    inputs=["a converted course JSON path (w, h, outline, areas)"], outputs=["OUT/course-outline.png", "its size and counts"],
    tests=["fractal: python fractal/fractal.py run course.osm.outline spec=<json>"],
    below=["course.osm.convert"], above=["course.osm"],
    dual="none: a picture is written, and the next run overwrites it",
    impl="native", fn=course_outline, params={"spec": "str, a converted course JSON path", "knobs": "steer knobs (filled by the runner)"},
    steer=STEER,
)
