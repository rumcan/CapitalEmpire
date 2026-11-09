"""course.design.worker: the course worker, which keeps a copy of the grid and bakes chunks and areas off the main thread."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.design.worker", rung=3, title="Course worker",
    purpose="Keep a copy of the course grid in a worker and answer its jobs: chunks of ground patches, and the areas of some holes.",
    requires=[
        "A 'chunks' job is answered with its patches, and an 'areas' job with the grid's areas; a failed job posts an 'error'.",
        "A 'grid' or 'cells' message updates the worker's copy of the grid and posts nothing back.",
    ],
    files=["src/game/course.worker.ts", "src/game/course-contour.ts"],
    dynamics=[
        Fn(name="onmessage", at="src/game/course.worker.ts:10", does="routes a grid update, a chunks job or an areas job", sig="scope.onmessage = (e: MessageEvent<ToCourse>)"),
        Fn(name="runChunks", at="src/game/course-contour.ts:35", does="bakes the chunks of one job into patches", sig="runChunks(g: Grid, job: CourseJob): CourseChunkOut[]"),
        Fn(name="applyToCourse", at="src/game/course-contour.ts:48", does="applies a grid or cells update to the worker's copy", sig="applyToCourse(g: Grid | null, m: ToCourse): Grid | null"),
        Fn(name="CourseContour", at="src/game/course-contour.ts:58", does="the main-thread side that posts jobs to the worker", sig="class CourseContour"),
    ],
    inputs=["ToCourse messages: grid, cells, chunks, areas"], outputs=["FromCourse messages: chunks (transferred buffers), areas, error"],
    tests=["tests/ext-course-grid-wiring.test.ts", "tests/course-owner-fixes.test.ts"],
    below=["course.design.grid", "course.surfaces"], above=["course.design"],
    dual="none needed: the worker holds no state the save keeps (it is rebuilt from the grid)",
    impl="describe",
)
