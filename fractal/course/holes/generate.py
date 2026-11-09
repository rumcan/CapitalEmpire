"""course.holes.generate: the generated old nine: a nine-hole layout laid on a site with the old pars, and the course's stats panel. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port generateOldNine (src/game/golf/coursegen.ts:56) with OLD_NINE_PARS (coursegen.ts:6): inputs a site {x0, y0, x1, y1} and a seed; "
         "output a CourseLayout {tee, green, bends per hole} for nine holes of pars 4 3 5 4 4 3 4 5 4; the stats panel is buildCourseStatsPanel "
         "(src/game/golf/coursestats.ts:164)")


def generate_old_nine(site: dict, seed: int = 1, knobs: dict | None = None):
    """a nine-hole layout on a site (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.holes.generate", rung=3, title="Old nine and course stats",
    purpose="Generate the old nine holes for a new course on its site, and the stats panel that scores the course: its length, its pars, its steep greens and fairways, and what it needs.",
    requires=[
        "The old nine have the pars 4, 3, 5, 4, 4, 3, 4, 5, 4 (OLD_NINE_PARS).",
        "A green slope steeper than 0.04 costs 4 points, capped at 12 (STEEP_GREEN_PENALTY, STEEP_GREEN_CAP).",
        "A fairway steeper than 0.12 costs 3 points, capped at 9 (FAIRWAY_MAX_SLOPE, STEEP_FAIRWAY_PENALTY).",
        "A metre is 1.0936133 yards (YARDS_PER_M).",
    ],
    files=["src/game/golf/coursegen.ts", "src/game/golf/coursestats.ts"],
    dynamics=[
        Fn(name="generateOldNine", at="src/game/golf/coursegen.ts:56", does="a nine-hole layout on a site, with the old pars", sig="generateOldNine(site, seed): CourseLayout"),
        Fn(name="courseQuality", at="src/game/golf/coursestats.ts:109", does="the quality score of a course and the hints it gives", sig="courseQuality(layout, holes, stats, currentMonth?)"),
        Fn(name="buildCourseStatsPanel", at="src/game/golf/coursestats.ts:164", does="the stats panel rows of a course", sig="buildCourseStatsPanel(layout, tier, have, month, height?)"),
        Fn(name="metresToYards", at="src/game/golf/coursestats.ts:89", does="metres to whole yards", sig="metresToYards(m): number"),
    ],
    inputs=["a site and a seed", "a course layout, its holes and stats"], outputs=["a nine-hole layout", "a quality score with hints", "a stats panel"],
    tests=["tests/golf-coursegen.test.ts", "tests/golf-coursegen-fixes.test.ts", "tests/golf-coursestats.test.ts", "tests/golf-wire-coursestats.test.ts", "tests/ui-coursestats.test.ts"],
    below=["course.estates.placing", "course.holes.records"], above=["course.holes", "ui"],
    dual="a generated nine is replaced by regenerating it on the same site (the seed decides it); the stats are recomputed",
    impl="native", fn=generate_old_nine, port=_TODO,
    steer={"old_nine_pars": [4, 3, 5, 4, 4, 3, 4, 5, 4], "steep_green_penalty": 4, "steep_green_cap": 12, "fairway_max_slope": 0.12, "steep_fairway_penalty": 3, "steep_fairway_cap": 9, "yards_per_m": 1.0936133},
)
