"""course.holes.frame: the tree frame round a hole: where the trees go along the hole's sides, what they cost, and which trees are picked. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port landingSpots (src/game/golf/holeframe.ts:88) and project (holeframe.ts:101) with the FRAME_RULES (holeframe.ts:20): inputs a hole "
         "length in metres and the landing widths; output the distances along the hole where a tree line may stand; the tree picks come from the "
         "FRAME_TREE_IDS deal (holeframe.ts:54), not ported here")


def landing_spots(length_m: float, widths: list[dict] | None = None, knobs: dict | None = None):
    """the spots along a hole where its frame trees may stand (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.holes.frame", rung=3, title="Hole tree frame",
    purpose="Frame a hole with trees: the spots along its sides where the frame stands, the price of each tree, and the planted trees that clear the line of play.",
    requires=[
        "A frame tree costs 60 (FRAME_TREE_PRICE): framePrice is the count times the unit.",
        "Trees are picked from the conifer and broadleaf sets (FRAME_CONIFER_IDS, FRAME_BROAD_DEAL).",
    ],
    files=["src/game/golf/holeframe.ts"],
    dynamics=[
        Fn(name="landingSpots", at="src/game/golf/holeframe.ts:88", does="the distances along a hole where a tree line may stand", sig="landingSpots(lengthM, widths?): number[]"),
        Fn(name="project", at="src/game/golf/holeframe.ts:101", does="projects a point onto a hole's line: its distance along and across", sig="project(line, x, y): {d, s}"),
        Fn(name="framePrice", at="src/game/golf/holeframe.ts:47", does="the price of n frame trees", sig="framePrice(n, unit = FRAME_TREE_PRICE): number"),
    ],
    inputs=["a hole's line", "the widths along it"], outputs=["landing spots", "projected points", "a price"],
    tests=["tests/golf-holeframe.test.ts", "tests/ext-hole-ground.test.ts", "tests/desert-start.test.ts"],
    below=["course.holes.plan", "course.holes.records"], above=["course.holes"],
    dual="a frame tree is removed by its tool (the props tool), and its money is not refunded by a plain undo (unverified)",
    impl="native", fn=landing_spots, port=_TODO,
    steer={"frame_tree_price": 60},
)
