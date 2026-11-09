"""course.design.grid: the course grid: cells of surface and grass, its areas, its edge fields and its patches for the ground bake."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.design.grid", rung=3, title="Course grid",
    purpose="The course as one grid of cells: what surface each cell is, the areas they make, the edge fields that shade them, and the patches the ground bake draws.",
    requires=[
        "The course patch is built in chunks of 64 cells (COURSE_CHUNK).",
        "A border is between 0.1 m and 8 m wide (BORDER_MIN_M, BORDER_MAX_M).",
        "A grid saved by an older version is migrated: loadCourseGrid returns 'migrate' or 'bad' when it cannot be read as it is.",
    ],
    files=[
        "src/game/ext/course-grid/index.ts",
        "src/game/ext/course-grid/areas.ts",
        "src/game/ext/course-grid/field.ts",
        "src/game/ext/course-grid/migrate.ts",
        "src/game/ext/course-grid/patch.ts",
    ],
    dynamics=[
        Fn(name="makeGrid", at="src/game/ext/course-grid/index.ts:63", does="a new empty course grid over a box of tiles", sig="makeGrid(x0, y0, w, h): Grid"),
        Fn(name="paintStroke", at="src/game/ext/course-grid/index.ts:128", does="paints a stroke of cells with a surface", sig="paintStroke(g, ax, ay, bx, by, r, ...)"),
        Fn(name="loadCourseGrid", at="src/game/ext/course-grid/migrate.ts:11", does="reads a saved grid, or says it needs migrating or is bad", sig="loadCourseGrid(save: unknown): Grid | 'migrate' | 'bad'"),
        Fn(name="migrateAreas", at="src/game/ext/course-grid/migrate.ts:25", does="turns old painted areas into course areas", sig="migrateAreas(g, areas): PaintArea[]"),
        Fn(name="growingHoles", at="src/game/ext/course-grid/areas.ts:25", does="which holes are still growing, and how far", sig="growingHoles(g, now): Map<number, number>"),
        Fn(name="coursePatch", at="src/game/ext/course-grid/patch.ts:230", does="the ground patch of one chunk, ready for the bake", sig="coursePatch(g, cx, cy, looks, now, ...)"),
        Fn(name="courseImages", at="src/game/ext/course-grid/field.ts:18", does="the edge images of the course field", sig="courseImages(f, look, feather)"),
    ],
    inputs=["paint strokes", "a saved grid", "the look of each surface"], outputs=["the grid", "areas", "chunk patches"],
    tests=["tests/ext-course-grid.test.ts", "tests/ext-course-grid-areas.test.ts", "tests/ext-course-grid-field.test.ts", "tests/ext-course-grid-wiring.test.ts", "tests/course-painting.test.ts"],
    below=["course.surfaces"], above=["course.design"],
    dual="undo of the paint stroke (the editor's undo stack); a saved grid is restored from the save",
    impl="describe", steer={"cell_t": 0.5, "course_chunk": 64, "max_grasses": 8, "border_min_m": 0.1, "border_max_m": 8},
)
