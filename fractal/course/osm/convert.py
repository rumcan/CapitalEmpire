"""course.osm.convert: turn a map course (its features as JSON) into a playable spec: the holes, the surfaces, the tees and pins, and a report. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port osmCourseToSpec (src/game/golf/osm/convert.ts:101) with scaleJson (convert.ts:88): inputs an OsmCourseJson "
         "(meta, boundary, features by kind, height) and ConvertOptions {scale}; output an OsmCourseSpec {id, name, w, h, originM, scale, holes, areas "
         "(SpecArea rings in tiles), tees, pins, warnings, fills, otherCourses, course}; needs fromosm.ts courseJsonOf (fromosm.ts:161), "
         "rotate.ts outlineOf (rotate.ts:40), derive.ts deriveHoleLines (derive.ts:39) and raster.ts paintSpec (raster.ts:49)")


def osm_course_to_spec(json: dict, opt: dict | None = None, knobs: dict | None = None):
    """a map course JSON to a spec (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.osm.convert", rung=3, title="Course converter",
    purpose="Turn a real course's map features into the game's spec: its fairways, greens, tees, bunkers and water as painted areas in tiles, its holes derived from the fairways, and a report of what was made up.",
    requires=[
        "A course converted with no holes gets a warning and is not built (osmCourseToSpec doc).",
        "A course scaled below 1 keeps its features in proportion (scaleJson).",
        "The turn of a course is snapped in steps of 15 degrees, with 1 degree fine (ROT_STEP, ROT_FINE).",
        "COVER_MAX is 18 (rotate.ts:14); its use is not yet traced in the converter.",
        "The fixture courses ship in the repo: rondebosch, magnolia-national and woodhill (src/game/golf/osm/data).",
    ],
    files=[
        "src/game/golf/osm/convert.ts",
        "src/game/golf/osm/fromosm.ts",
        "src/game/golf/osm/geom.ts",
        "src/game/golf/osm/types.ts",
        "src/game/golf/osm/rotate.ts",
        "src/game/golf/osm/raster.ts",
        "src/game/golf/osm/derive.ts",
        "src/game/golf/osm/grade.ts",
        "src/game/golf/osm/preview.ts",
        "src/game/golf/osm/index.ts",
        "src/game/golf/osm/data/rondebosch.json",
        "src/game/golf/osm/data/magnolia-national.json",
        "src/game/golf/osm/data/woodhill.json",
    ],
    dynamics=[
        Fn(name="osmCourseToSpec", at="src/game/golf/osm/convert.ts:101", does="the converter: a map course JSON to a spec", sig="osmCourseToSpec(json0, opt = {}): OsmCourseSpec"),
        Fn(name="courseJsonOf", at="src/game/golf/osm/fromosm.ts:161", does="the course JSON of a raw map answer", sig="courseJsonOf(raw, ref, info): OsmCourseJson"),
        Fn(name="deriveHoleLines", at="src/game/golf/osm/derive.ts:39", does="guesses the hole lines from the fairways, greens and tees (a guess, never mapped data)", sig="deriveHoleLines(fairways, greens, tees)"),
        Fn(name="paintSpec", at="src/game/golf/osm/raster.ts:49", does="paints a spec's surfaces onto the grid", sig="paintSpec(g, spec, ox, oy)"),
        Fn(name="reportOf", at="src/game/golf/osm/grade.ts:61", does="the report of what was mapped and what was made up", sig="reportOf(json, spec): CourseReport"),
        Fn(name="previewOps", at="src/game/golf/osm/preview.ts:50", does="the drawing operations of a course preview", sig="previewOps(json, size, spec?)"),
    ],
    inputs=["an OsmCourseJson (features by kind, boundary, height)", "ConvertOptions {scale}"], outputs=["an OsmCourseSpec", "a report"],
    tests=["tests/golf-osm-course.test.ts", "tests/golf-osm-place.test.ts", "tests/golf-osm-mirrors.test.ts", "tests/golf-osm-land.test.ts"],
    below=["course.osm.fetch"], above=["course.osm", "course.holes"],
    dual="none: a spec is built fresh from the JSON; the placed course is undone by its parcel (see course.osm)",
    impl="native", fn=osm_course_to_spec, port=_TODO,
    steer={"rot_step": 15, "rot_fine": 1, "cover_max": 18, "min_scale": 0.3, "derive_green": 40, "derive_tee_beyond": 300},
)
