"""course.holes.records: the course's hole records: the holes derived from the areas and the marks, their par and length, the presets and the player's saved holes. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port deriveHoles (src/game/golf/holes.ts:131) with parFromLength (holes.ts:66) and courseStats (holes.ts:177): inputs the course areas, "
         "tee marks, pins and aims; output Hole {n, par, lengthM, memberLengthM, line, warnings, sets} per hole and CourseStats {holes, par, lengthM, mix}; "
         "the line is holeLine (holes.ts:69) and the length lineLength (holes.ts:74)")


def derive_holes(areas: list[dict], tees: list[dict], pins: list[dict], aims: list[dict], knobs: dict | None = None):
    """the holes of a course from its areas and marks (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.holes.records", rung=3, title="Hole records and presets",
    purpose="The holes as the game keeps them: each hole's par, length and line, the presets a new hole starts from, the player's saved holes, and the view of each hole's checks.",
    requires=[
        "A hole's par is 3 up to 230 m, 4 up to 430 m, and 5 beyond (parFromLength).",
        "The game counts 18 holes (HOLES) and keeps at most 24 of the player's saved holes (MY_HOLES_MAX).",
        "A hole with no pin on its green has the warning 'The pin is not on a green' (PIN_OFF_GREEN).",
    ],
    files=["src/game/golf/holes.ts",
        "src/game/golf/holepreset.ts",
        "src/game/golf/myholes.ts",
        "src/game/golf/holeview.ts", "src/game/golf/daypins.ts", "src/game/golf/types.ts", "src/game/golf/growlabel.ts"],
    dynamics=[
        Fn(name="deriveHoles", at="src/game/golf/holes.ts:131", does="the holes from the course's areas, tee marks, pins and aims", sig="deriveHoles(areas, tees, pins, aims): Hole[]"),
        Fn(name="courseStats", at="src/game/golf/holes.ts:177", does="the course's totals: holes, par, length and the mix of pars", sig="courseStats(holes): CourseStats"),
        Fn(name="holePreset", at="src/game/golf/holepreset.ts:28", does="a preset hole from a seed: its areas and props", sig="holePreset(seed): HolePreset"),
        Fn(name="captureHole", at="src/game/golf/myholes.ts:55", does="saves a hole of the course as one of the player's holes", sig="captureHole(n, c): MyHole | null"),
        Fn(name="holeViews", at="src/game/golf/holeview.ts:157", does="the view of each hole: its checks and warnings", sig="holeViews(areas, golf): HoleView[]"),
    ],
    inputs=["the course's areas, tees, pins and aims", "a seed for a preset"], outputs=["holes", "course stats", "presets", "saved holes", "hole views"],
    tests=["tests/golf-holes.test.ts", "tests/golf-holetools.test.ts", "tests/golf-holepreset.test.ts", "tests/golf-hole-card.test.ts", "tests/holeview.test.ts", "tests/golf-coursestats.test.ts"],
    below=["course.tees.placement", "course.surfaces.grasses"], above=["course.holes", "play", "ui"],
    dual="a saved hole is removed from the list (myholes.ts) and a derived hole is recomputed from the marks",
    impl="native", fn=derive_holes, port=_TODO,
    steer={"my_holes_max": 24, "holes": 18, "par_3_max_m": 230, "par_4_max_m": 430, "pin_off_green": "The pin is not on a green"},
)
