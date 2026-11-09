"""course: course design and the course tools, surfaces and mowing, tees, greens, bunkers, cart paths, the real-course import, estates (T410, #1110)."""
from fractal.holon import Holon

HOLON = Holon(
    id="course", rung=1, title="Course",
    purpose="Design the golf course on the town's land: its surfaces (fairway, rough, green, tee, bunker, water), mowing, tees, greens, bunkers, cart paths, a real course imported from the map, and the estates on it.",
    requires=[
        "A course is painted in grid cells of 0.5 tile (CELL_T), grouped into chunks of 64 cells (COURSE_CHUNK) that the course worker bakes.",
        "The mowing kinds are fairway, green, tee and rough (MOW_KINDS), and a fairway with no pattern set lays wide stripes (DEFAULT_FAIRWAY_PATTERN).",
        "The course finish is on by default (DEFAULT_COURSE_FINISH.on), so a look with no mowing settings lays the finish's own stripes.",
        "The course height is clamped to -3 m .. +3 m (CH_MIN_M, CH_MAX_M) and the green slope is capped at 0.06 (GREEN_MAX_SLOPE).",
        "A built house lot always has a house facing its street: the estate tool refuses a lot with no street (NO_STREET).",
    ],
    below=["land", "render", "ui", "art"],
    above=["play", "town", "business", "core"],
    rules=[
        "sun upper right, shadows 145 degrees",
        "no flat colour washes: surfaces are textured, mowing lightens or darkens the texture",
        "highlights are textured, inset from edges",
        "no visible tiling",
        "new art used everywhere; the old look kept as an option",
        "straight views turned 8 degrees",
        "performance is a hard gate: ground plus tiles at most 192 MB",
        "roads rebuild instantly: no manual ground rebuild",
        "town jams are the player's job",
        "a built house lot always has a house facing its street",
    ],
)
