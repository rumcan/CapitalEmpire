"""people.animation.facing: Eight facings and their ring (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

import math

from PIL import Image, ImageDraw

from fractal.holon import OUT

FACINGS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"]


def facing(dx: float, dy: float) -> int:
    """the screen facing 0-7 (FACINGS order) of a move (dx, dy) in tiles (pedestrians.ts facing: +x right-down, +y left-down)"""
    sx, sy = dx - dy, (dx + dy) / 2
    deg = math.degrees(math.atan2(sy, sx))
    return math.floor((deg - 90) / 45 + 0.5) % 8


def facing_ring(knobs: dict) -> dict:
    """a PNG ring of the eight facings at their screen angles, each labelled; checks each direction maps back to its own facing"""
    S = int(knobs["size"])
    c, r = S / 2, S * knobs["radius"]
    im = Image.new("RGBA", (S, S), tuple(knobs["background"]))
    d = ImageDraw.Draw(im)
    d.ellipse([c - r, c - r, c + r, c + r], outline=tuple(knobs["ring"]), width=max(1, S // 64))
    ok = []
    for k, name in enumerate(FACINGS):
        a = math.radians(90 + 45 * k)
        x, y = c + r * math.cos(a), c + r * math.sin(a)
        d.ellipse([x - S * 0.03, y - S * 0.03, x + S * 0.03, y + S * 0.03], fill=tuple(knobs["dot"]))
        lx, ly = c + (r + S * 0.09) * math.cos(a), c + (r + S * 0.09) * math.sin(a)
        d.text((lx - S * 0.02, ly - S * 0.02), name, fill=tuple(knobs["ink"]))
        sx, sy = math.cos(a), math.sin(a)
        ok.append(facing((sx + 2 * sy) / 2, (2 * sy - sx) / 2) == k)
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / "people-facing-ring.png"
    im.save(p)
    return {"path": str(p), "facings": FACINGS, "round_trip": all(ok)}

HOLON = Holon(
    id='people.animation.facing',
    rung=3,
    title='Eight facings and their ring',
    purpose='The eight facings of a move on screen, and a picture of the ring they make, to check the sheet rows.',
    requires=['facing(dx, dy) gives 0 to 7 in FACINGS order (S SW W NW N NE E SE): each screen direction is one sheet row.', 'Each of the eight ring directions maps back to its own facing (round_trip is true).'],
    dynamics=[
        Fn(name='facing', at='src/game/ext/pedestrians/pedestrians.ts:67', does='the screen facing of a move in tiles', sig='(dx: number, dy: number) => number'),
        Fn(name='FACING_ROW', at='src/game/ext/pedestrians/pedestrians.ts:72', does="each facing's sheet row and its never-mirrored flag", sig='readonly [number, boolean][]')],
    inputs=['the ring knobs (steer)'],
    outputs=['a PNG path and {facings, round_trip}'],
    tests=['axis-headings.test.ts', 'axis-views.test.ts'],
    below=['art'],
    above=['people.crowd', 'people.animals.walk', 'people.staff'],
    dual='derived; nothing to undo',
    rules=['lit sprites are never mirrored', 'straight views turned 8 degrees'],
    impl='native',
    steer={'size': 256, 'radius': 0.36, 'ring': [255, 255, 255, 200], 'dot': [255, 200, 60, 255], 'ink': [255, 255, 255, 255], 'background': [24, 28, 32, 255]},
    fn=facing_ring,
)
