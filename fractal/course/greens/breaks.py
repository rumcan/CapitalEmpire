"""course.greens.breaks: the break grid of a green (the slope a putt reads), by the play domain's green.ts. The file is play-owned: this leaf documents its course side."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port buildBreakGrid and breakAt (src/game/golf/play/green.ts:32, :57): inputs a height function (a grid of metres, or a tilt plane), a green mask and a centre and radius; output {n, pts, ij, x0, y0, x1, y1} with the steep bucket per cell")


def break_grid(cx: float, cy: float, r: float, knobs: dict | None = None):
    """the break grid round a point (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.greens.breaks", rung=3, title="Break grid",
    purpose="The slope of a green as a putt reads it: a grid of breaks, each cell with a steepness bucket, so the player sees where a putt will bend.",
    requires=[
        "A slope at or under 0.002 is flat: its steep share is 0 (steepShare, FLAT_SLOPE).",
        "The break grid is sampled at 0.5 m (BREAK_STEP) and has four colours, one per steepness bucket (BREAK_COLOURS).",
        "A putt's speed is 0.35 plus 1.1 times the steep share (dotSpeed).",
    ],
    dynamics=[
        Fn(name="breakAt", at="src/game/golf/play/green.ts:32", does="the break vector of the slope at a point", sig="breakAt(height, x, y): {dx, dy, s}"),
        Fn(name="buildBreakGrid", at="src/game/golf/play/green.ts:57", does="the break grid over a radius round a point, on the green only", sig="buildBreakGrid(height, onGreen, cx, cy, r): BreakGrid"),
        Fn(name="breakBucket", at="src/game/golf/play/green.ts:71", does="the steepness bucket of a slope, 0 to 3", sig="breakBucket(s): number"),
    ],
    inputs=["the height at a point", "whether a point is on the green", "a centre and a radius"], outputs=["the break grid", "a bucket per cell"],
    tests=["tests/golf-green.test.ts", "tests/course-finish.test.ts", "tests/course.test.ts"],
    below=["course.terrain.height"], above=["course.greens", "play"],
    dual="none: the grid is recomputed from the height (nothing to undo)",
    impl="native", fn=break_grid, port=_TODO,
    steer={"break_step": 0.5, "flat_slope": 0.002, "steep_slope": 0.04, "cup_r_m": 0.054, "ball_r_m": 0.0214, "break_colours": ["255,255,255", "125,211,252", "250,204,21", "249,115,22"]},
)
