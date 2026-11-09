"""course.mowing: the mowing lines of the course (the patterns and their bands) and the grass management that mows, waters and seeds the ground."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.mowing", rung=2, title="Mowing",
    purpose="Lay the mowing lines the player sets (along the hole, wide stripes, crosscut, halves, collar ring, straight, checkerboard, diamond) and run the grass upkeep: mow, water, feed, aerate, seed and sod.",
    requires=[
        "There are eight mowing patterns (MOW_PATTERNS), and the fairway's pattern is wide stripes unless a look sets one (DEFAULT_FAIRWAY_PATTERN).",
        "The mowing width is between 0.5 and 16 tiles, the light and dark are each between 0 and 1, and the angle between -90 and 90 degrees (MOW_RANGES).",
        "A mow costs 2 and a water 1 in the grass upkeep (GRASS_COST).",
    ],
    below=["course.surfaces"], above=["course", "play", "business"],
    dual="a look's mowing settings are cleared to the finish's own (sameMow compares them): the old look is kept as an option",
    rules=["no flat colour washes: mowing lightens or darkens the texture, never a wash", "town jams are the player's job"],
)
