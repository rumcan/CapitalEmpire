"""course.design.cursor: the paint cursor and the run / square brushes (ext/course-cursor)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.design.cursor", rung=3, title="Paint cursor and run brush",
    purpose="The cursor that paints the course: a dab, a run of cells along a line, a square, and the puck that shows where paint lands.",
    requires=[
        "A run is laid cell by cell along the line from its start to its end (runCells).",
        "A dab snaps to the 0.5-tile cell grid before it is painted (snapDab).",
    ],
    files=[
        "src/game/ext/course-cursor/index.ts",
        "src/game/ext/course-cursor/run.ts",
        "src/game/ext/course-cursor/snap.ts",
        "src/game/ext/course-cursor/tex.ts",
    ],
    dynamics=[
        Fn(name="CourseCursor", at="src/game/ext/course-cursor/index.ts:865", does="the cursor class: draws the puck and the run footprint, paints dabs and runs", sig="class CourseCursor"),
        Fn(name="runCells", at="src/game/ext/course-cursor/run.ts:55", does="the cell indices a run covers", sig="runCells(path, n): Int32Array"),
        Fn(name="snapDab", at="src/game/ext/course-cursor/snap.ts:8", does="snaps a coordinate to the cell grid", sig="snapDab(v: number): number"),
        Fn(name="browserCursorTexture", at="src/game/ext/course-cursor/tex.ts:27", does="the browser canvas texture for the puck (DOM: not runnable in Python)", sig="browserCursorTexture(): CursorTexture"),
    ],
    inputs=["a pointer position in tiles", "a brush kind and size"], outputs=["painted cells", "a puck outline"],
    tests=["tests/ext-course-cursor.test.ts", "tests/ext-course-run.test.ts", "tests/course-rub-out.test.ts", "tests/t299-square-brush-preview.test.ts"],
    below=["course.design.grid"], above=["course.design"],
    dual="undo of the paint stroke (the editor's undo stack)",
    impl="describe", steer={"cell_t": 0.5, "square_sizes": [1, 2, 3, 4]},
)
