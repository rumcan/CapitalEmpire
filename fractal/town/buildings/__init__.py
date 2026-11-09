"""town.buildings: the placement and facing of the buildings on a lot: the house's turn, its doors and classes, and the lot models."""
from fractal.holon import Holon

HOLON = Holon(
    id="town.buildings", rung=2, title="Buildings: placement and facing",
    purpose="Turn each house to face its street, place its doors and garage, class it by size, and keep the lot models it is placed by.",
    requires=[
        "turnsBetween gives the shortest turn between two of the eight facings (src/game/lots/house-facing.ts:23).",
        "A built house lot always has a house facing its street (tests/house-lots-have-houses.test.ts).",
        "A house's class (small, medium, large) comes from its footprint area (src/game/lots/house-class.ts:29, :59).",
    ],
    below=["town.lots"], above=["town.compose", "town.audit"],
    rules=["a built house lot always has a house facing its street", "straight views are turned 8 degrees", "lit sprites are never mirrored"],
)
