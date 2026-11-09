"""course.greens: the greens' slope as the ball reads it (the break grid) and the roll edge that shows a green's lip."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.greens", rung=2, title="Greens",
    purpose="Read a green's slope for the putt (the break grid: how far a putt bends and how fast it runs) and draw the green's roll at its edge.",
    requires=[
        "A green slope under 0.002 counts as flat, and one of 0.04 or more as the steepest (FLAT_SLOPE, STEEP_SLOPE).",
        "The cup is 0.054 m in radius and the ball 0.0214 m (CUP_R_M, BALL_R_M).",
    ],
    below=["course.terrain.height", "course.surfaces"],
    above=["course", "play"],
    dual="none: the break grid is computed from the height each time (nothing is stored to undo)",
    rules=["sun upper right, shadows 145 degrees", "no flat colour washes"],
)
