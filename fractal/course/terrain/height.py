"""course.terrain.height: the course height field, its brush and journal, and the light that shows the slope."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.terrain.height", rung=3, title="Course height",
    purpose="The height of the course ground: raise or lower it with the brush, undo a step, and light the slope so the course reads in relief.",
    requires=[
        "The height is clamped to -3 m .. +3 m (clampCourseHeightM).",
        "A brush step keeps its before and after heights, so the journal can undo it.",
        "The light's sun is at 145 degrees (SUN_SHADOW_DEG).",
    ],
    files=[
        "src/game/ext/course-height/index.ts",
        "src/game/ext/course-height/journal.ts",
        "src/game/ext/course-height/light.ts",
        "src/game/ext/course-height/light.json",
    ],
    dynamics=[
        Fn(name="createCourseHeightField", at="src/game/ext/course-height/index.ts:72", does="a flat course height field", sig="createCourseHeightField(): CourseHeightField"),
        Fn(name="applyCourseHeightBrush", at="src/game/ext/course-height/index.ts:198", does="raises or lowers the field under one brush dab", sig="applyCourseHeightBrush(field, dab)"),
        Fn(name="courseShadeInto", at="src/game/ext/course-height/index.ts:113", does="the slope shade of a box of tiles, written into a buffer", sig="courseShadeInto(h, out, box, ...)"),
        Fn(name="CourseHeightJournal", at="src/game/ext/course-height/journal.ts:26", does="the undo journal of height steps", sig="class CourseHeightJournal"),
        Fn(name="heightLightGrid", at="src/game/ext/course-height/light.ts:136", does="the light grid of the height field", sig="heightLightGrid(h, box, ...)"),
        Fn(name="applyHeightLight", at="src/game/ext/course-height/light.ts:276", does="writes the height light into a picture", sig="applyHeightLight(px, pw, ph, toTile, ...)"),
    ],
    inputs=["brush dabs", "the height field"], outputs=["the height field", "shade and light pictures"],
    tests=["tests/ext-course-height.test.ts", "tests/ext-course-height-brush.test.ts", "tests/ext-course-height-light.test.ts", "tests/ext-course-height-land-light.test.ts", "tests/ext-course-height-wiring.test.ts"],
    below=["course.design.grid"], above=["course.terrain"],
    dual="CourseHeightJournal (undo of a brush step)",
    impl="describe", steer={"ch_step": 2, "ch_min_m": -3.0, "ch_max_m": 3.0, "light_exag": 2.2, "gentle_gain": 7.5, "gentle_slope": 0.04, "sun_shadow_deg": 145},
)
