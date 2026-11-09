"""course.terrain: the course's height field (the brush that raises and lowers it), the light that shows its slope, and the grade setting."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.terrain", rung=2, title="Course terrain",
    purpose="Shape the course ground: the height brush and its journal, the light that shows the slope, and the grade setting.",
    requires=[
        "The course height is sampled on a 2-tile step (CH_STEP) and clamped to -3 m .. +3 m.",
        "The grade setting is on by default with strength 1 and edge blur off (GRADE_DEFAULT).",
    ],
    below=["land"], above=["course"],
    dual="CourseHeightJournal: each brush step keeps its before and after heights, so undo puts the ground back",
    rules=["sun upper right, shadows 145 degrees", "no flat colour washes"],
)
