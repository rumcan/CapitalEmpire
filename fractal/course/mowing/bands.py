"""course.mowing.bands: the mowing lines of a hole: the pattern's bands laid along the line of play, or at an angle (course-stripes.ts and mow-lines.ts)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port holeStripeLegs (src/game/course-stripes.ts:44) with its bands helper (course-stripes.ts:34): inputs a flat line of x,y tiles, "
         "a StripeLook {w, l, k, lc, dc, t, f, across, check?, half?} and an optional angle in degrees; output the legs as bands {leg, band, light} "
         "with the stripe rectangles; the pattern numbers come from PATTERN_LOOKS (src/game/mow-lines.ts:45)")


def hole_stripe_legs(line: list[float], look: dict, angle: float | None = None, knobs: dict | None = None):
    """the bands of one hole's mowing lines (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.mowing.bands", rung=3, title="Mowing bands of a hole",
    purpose="The light and dark bands the mowing pattern lays on a hole's fairway: along the line of play, in a crosscut, as halves, a collar ring, straight at an angle, or a checkerboard.",
    requires=[
        "With an angle set, one set of parallel bands is laid at that angle over the whole hole (holeStripeLegs).",
        "A pattern's numbers come from PATTERN_LOOKS where the look sets none; the fairway's default is wide stripes.",
        "A crosscut's crossing angle is between 15 and 90 degrees (CROSS_RANGE), and 90 by default (CROSS_DEFAULT).",
    ],
    files=["src/game/mow-lines.ts", "src/game/course-stripes.ts"],
    dynamics=[
        Fn(name="holeStripeLegs", at="src/game/course-stripes.ts:44", does="the bands of one hole's line, at an angle when given", sig="holeStripeLegs(line, look, angle?): StripeLeg[]"),
        Fn(name="crosscutLegs", at="src/game/course-stripes.ts:91", does="the two crossed sets of stripes of a crosscut", sig="crosscutLegs(across, cross): [StripeLeg[], StripeLeg[]]"),
        Fn(name="fairwayStripeLook", at="src/game/course-stripes.ts:25", does="the fairway's stripe look from the range outfield preset", sig="fairwayStripeLook(presets?): StripeLook"),
        Fn(name="clampMow", at="src/game/mow-lines.ts:65", does="clamps a look's mowing settings to their ranges", sig="clampMow(m: unknown): MowOpts | undefined"),
    ],
    inputs=["a hole's line in tiles", "a StripeLook", "an optional angle"], outputs=["the bands as stripe legs"],
    tests=["tests/mow-patterns.test.ts", "tests/mowing-lines.test.ts", "tests/course-stripes.test.ts", "tests/stripes.test.ts"],
    below=["course.surfaces.finish"], above=["course.mowing"],
    dual="a look's mowing settings are cleared to the finish's own: clampMow of nothing lays the finish's bands again",
    impl="native", fn=hole_stripe_legs, port=_TODO,
    steer={"width_range": [0.5, 16], "light_range": [0, 1], "dark_range": [0, 1], "angle_range": [-90, 90], "crossing_range": [15, 90], "crossing_default": 90, "default_pattern": "wide"},
)
