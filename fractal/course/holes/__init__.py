"""course.holes: the holes: each hole's plan (tee, green, bends and width), the ground it is shaped to, its record and frame of trees, and the generated old nine."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.holes", rung=2, title="Holes",
    purpose="Design the course's eighteen holes: draw a hole's plan from tee to green with its bends and width, shape the ground to it, keep its record, frame it with trees, and generate an old nine for a new course.",
    requires=[
        "A hole's green is between 400 and 700 square metres, in steps of 50 (GREEN_M2_MIN, GREEN_M2_MAX, GREEN_M2_STEP).",
        "A hole's width is between 12 and 60 metres (WIDTH_MIN, WIDTH_MAX), and it has at most 3 bends (MAX_BENDS).",
        "A hole is at least 60 m long (MIN_HOLE_M).",
        "A par is 3 up to 230 m, 4 up to 430 m, and 5 beyond (parFromLength).",
        "The course has 18 holes (HOLES) and at most 24 saved holes (MY_HOLES_MAX).",
    ],
    below=["course.tees", "course.surfaces", "course.terrain", "course.design"],
    above=["course", "play", "business"],
    dual="the wizard's undo: each plan change is one step (withPlan, withoutPlan); a saved hole is removed from the list",
    rules=["straight views turned 8 degrees", "no flat colour washes", "town jams are the player's job"],
)
