"""course.surfaces.finish: the course finish: the fairway's bands along each hole, the green's fine stripes, the collar and the edge."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.surfaces.finish", rung=3, title="Course finish",
    purpose="The finish that makes the course read as a course: light and dark bands along the fairways, fine stripes on the greens, and the collar round each surface.",
    requires=[
        "The finish is on by default and its band width is 3 tiles (DEFAULT_COURSE_FINISH: on, bandWidth 3).",
        "Each finish number is clamped to its range (FINISH_RANGES); bandWidth is between 1 and 16 tiles.",
        "The finish's band light is 0.16 and its band dark is 0.34 (BAND_LIGHT, BAND_DARK): a texture made lighter or darker, never a flat wash.",
    ],
    files=["src/game/course-finish.ts"],
    dynamics=[
        Fn(name="clampCourseFinish", at="src/game/course-finish.ts:62", does="clamps a saved finish to its ranges", sig="clampCourseFinish(f: unknown): CourseFinish"),
        Fn(name="finishOf", at="src/game/course-finish.ts:71", does="the finish of a course file, or the default", sig="finishOf(file): CourseFinish"),
        Fn(name="finishStripeLook", at="src/game/course-finish.ts:90", does="the fairway stripe look the finish lays over a base look", sig="finishStripeLook(f, base): StripeLook | null"),
        Fn(name="greenStripeLook", at="src/game/course-finish.ts:95", does="the green's fine stripe look", sig="greenStripeLook(f, base): StripeLook | null"),
    ],
    inputs=["the course file's finish", "a base stripe look"], outputs=["a stripe look for the fairway or the green", "a finish"],
    tests=["tests/course-finish.test.ts", "tests/mowing-lines.test.ts", "tests/mow-patterns.test.ts", "tests/paint-polish.test.ts"],
    below=["course.mowing.bands"], above=["course.surfaces"],
    dual="a finish off (FINISH_OFF) lays the course with no bands; the course file keeps the old finish",
    impl="describe",
    steer={"band_width": 3, "band_strength": 0.8, "green_width": 0.75, "band_light": 0.16, "band_dark": 0.34, "band_soft": 0.14, "green_light": 0.2, "green_dark": 0.2, "band_tint": "#fff0b4"},
)
