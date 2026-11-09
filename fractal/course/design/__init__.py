"""course.design: the course editor's canvas tools, the piece snap, the course grid and the worker that bakes it."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.design", rung=2, title="Course design tools",
    purpose="The course editor: the paint cursor and run brush, the snap of pieces, the course grid, the piece buttons, and the worker that bakes the grid.",
    requires=[
        "A dab is snapped to the 0.5-tile cell grid (snapDab rounds to CELL_T).",
        "The square brush sizes are 1, 2, 3 and 4 cells (SQUARE_SIZES).",
        "The course grid holds at most 8 custom grasses (MAX_GRASSES) on top of the built-in surfaces (SURF).",
    ],
    below=["course.surfaces", "course.mowing", "course.tees", "course.bunkers"],
    above=["course"],
    dual="the editor's undo stack: each paint stroke or piece is one undo step (net-undo-stack tests)",
    rules=["roads rebuild instantly: no manual ground rebuild", "performance is a hard gate"],
)
