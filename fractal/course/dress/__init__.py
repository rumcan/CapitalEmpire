"""course.dress: the course's dressing: the decor the player places (plants, water, stone, seats, signs) and the ponds the water makes on the course."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.dress", rung=2, title="Course dressing",
    purpose="Dress the course: place decor items (trees, flowers, statues, benches, signs) at a size, and let the water of the course make ponds with their rims.",
    requires=[
        "A decor item is sized between 80% and 120% in steps of 5% (SIZE_MIN, SIZE_MAX, SIZE_STEP).",
        "A pond is at most 60000 half-metre cells (POND_MAX_CELLS) and at least 12 cells (POND_MIN_CELLS).",
        "A tee marker uses one prop id for every tee set (TEE_MARKER_ID), the back, middle, senior and forward sets sharing it.",
    ],
    below=["course.design", "course.surfaces", "land"],
    above=["course", "business", "play"],
    dual="a decor item is removed by its tool; a pond is recomputed from the water (nothing stored to undo)",
    rules=["no flat colour washes", "town jams are the player's job"],
)
