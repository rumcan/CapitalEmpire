"""course.holes.ground: the ground a hole is shaped to: its mounds and hollows and the roll of the land, and the terrain the play reads from it. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port shapeHoleGround (src/game/ext/hole-ground/index.ts:184) with rollKnots (index.ts:131) and knotAt (index.ts:120): inputs a HoleGroundInput "
         "(the plan, the height field, the features) and the HOLE_GROUND constants (index.ts:32); output a HoleGroundShape {k, before, after} of the cells "
         "it changes; holeTerrain (src/game/golf/hole-terrain.ts:56) is the play-side read of the same field")


def shape_hole_ground(plan: dict, field: list[float] | None = None, knobs: dict | None = None):
    """the ground shape of a hole (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.holes.ground", rung=3, title="Hole ground and terrain",
    purpose="Shape the ground of a hole to its plan: the mounds and hollows a designer adds, the roll of the fairway, and the terrain the ball and the player read along the line.",
    requires=[
        "The hole's ground is seeded from its plan (holeGroundSeed), so the same plan always shapes the same ground.",
        "The terrain along a hole is sampled every 2 m (TERRAIN_STEP) and its plays-like adds 1 per metre (PLAYS_LIKE_PER_M).",
        "The fairway skips 15 m at the tee and 10 m at the pin when it is measured (FAIRWAY_SKIP_TEE, FAIRWAY_SKIP_PIN).",
    ],
    files=["src/game/ext/hole-ground/index.ts", "src/game/golf/hole-terrain.ts"],
    dynamics=[
        Fn(name="shapeHoleGround", at="src/game/ext/hole-ground/index.ts:184", does="shapes a hole's ground from its plan", sig="shapeHoleGround(inp): HoleGroundShape"),
        Fn(name="applyHoleGround", at="src/game/ext/hole-ground/index.ts:407", does="applies a shape to the course height field", sig="applyHoleGround(field, shape): CourseHeightField"),
        Fn(name="rollKnots", at="src/game/ext/hole-ground/index.ts:131", does="the knots of the roll along a hole's length", sig="rollKnots(seed, lengthM, grade)"),
        Fn(name="holeTerrain", at="src/game/golf/hole-terrain.ts:56", does="the terrain a hole's play reads, from the height field", sig="holeTerrain(field, hole): HoleTerrain"),
    ],
    inputs=["a hole's plan", "the course height field"], outputs=["a ground shape", "an applied height field", "the terrain of a hole"],
    tests=["tests/ext-hole-ground.test.ts", "tests/golf-hole-terrain.test.ts"],
    below=["course.terrain.height", "course.holes.plan"], above=["course.holes", "play"],
    dual="the shape keeps its before and after cells (HoleGroundShape.before, .after), so it can be undone",
    impl="native", fn=shape_hole_ground, port=_TODO,
    steer={"terrain_step": 2, "plays_like_per_m": 1, "fairway_skip_tee": 15, "fairway_skip_pin": 10},
)
