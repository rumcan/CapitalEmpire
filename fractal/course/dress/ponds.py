"""course.dress.ponds: the pond the course's water makes: the cells of one wet area, its rims and plants. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port pondAt (src/game/golf/ponds.ts:36) with inPond (ponds.ts:56) and pondId (ponds.ts:60): inputs a start point, a wet test "
         "(a grid of half-metre cells, CELL 0.5) and the max cells (60000); output a Pond {x0, y0, w, h, mask, cells} or null when the area is "
         "too small (POND_MIN_CELLS 12) or too big")


def pond_at(x: float, y: float, wet: list[list[int]], max_cells: int = 60000, knobs: dict | None = None):
    """the pond at a point of the water grid (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.dress.ponds", rung=3, title="Ponds and their rims",
    purpose="Find the pond a water cell belongs to on the course, size it, and dress its rim with stones and plants.",
    requires=[
        "A pond is found on a grid of half-metre cells (CELL 0.5) and has at most 60000 cells (POND_MAX_CELLS).",
        "A pond with fewer than 12 cells is not a pond (POND_MIN_CELLS); one with 500 or more is a big pond (BIG_POND_CELLS).",
        "The land reaches 0.5 m from a pond's edge (LAND_REACH) and a plant at most 2 m (PLANT_REACH).",
    ],
    files=["src/game/golf/ponds.ts"],
    dynamics=[
        Fn(name="pondAt", at="src/game/golf/ponds.ts:36", does="the pond at a point, from a wet test", sig="pondAt(x, y, wet, max, other?): Pond | null"),
        Fn(name="inPond", at="src/game/golf/ponds.ts:56", does="whether a cell is in the pond", sig="inPond(p, cx, cy): boolean"),
        Fn(name="pondId", at="src/game/golf/ponds.ts:60", does="a stable id for a pond from its first cell", sig="pondId(p): number"),
    ],
    inputs=["a point on the course's water", "a wet test"], outputs=["a pond with its mask and cell count", "rim pieces"],
    tests=["tests/ponds.test.ts", "tests/water-look.test.ts", "tests/golf-osm-course.test.ts"],
    below=["course.design.grid", "course.surfaces.blobs"], above=["course.dress"],
    dual="none: a pond is recomputed from the water (nothing stored to undo)",
    impl="native", fn=pond_at, port=_TODO,
    steer={"cell": 0.5, "pond_max_cells": 60000, "pond_min_cells": 12, "big_pond_cells": 500, "land_reach": 0.5, "plant_reach": 2, "rim_block": 20},
)
