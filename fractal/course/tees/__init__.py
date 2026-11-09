"""course.tees: the tee boxes (their place, turn, scale and set of tees) and the walls that stand round a tee, bunker or rock."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.tees", rung=2, title="Tees and tee walls",
    purpose="Place each hole's tee boxes in one of four sets (back, middle, senior, forward), turn and scale them, and build the walls round a tee's edge where the ground drops.",
    requires=[
        "There are four tee sets: back, middle, senior and forward (TEE_KINDS); the default is middle (DEFAULT_SET).",
        "A tee box is 14 m long and 8 m wide at scale 1 (BOX_LEN_M, BOX_WID_M), and scales between 0.7 and 2 in steps of 0.1.",
        "A tee is at least 60 m from its pin (TEE_MIN_TO_PIN_M).",
        "A tee wall is one of bunker, sand or rock (TEE_WALLS).",
    ],
    below=["course.design", "course.surfaces"],
    above=["course", "play"],
    dual="a tee box is removed by its marker, and a wall falls back to the surface's own edge (the editor's undo stack)",
    rules=["no flat colour washes", "straight views turned 8 degrees"],
)
