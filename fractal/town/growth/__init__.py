"""town.growth: the town's growth: the city engine that ties roads, lots, traffic, farms and money together, the plan of the districts, and the iconic places."""
from fractal.holon import Holon

HOLON = Holon(
    id="town.growth", rung=2, title="Town growth and the city engine",
    purpose="Grow the town from the player's roads and access: plan its districts, place its iconic places, and step the city each tick.",
    requires=[
        "City.step advances the city by n ticks and returns its events and milestones (src/game/city.ts:757).",
        "City.netOps applies road ops and returns the lots added and removed (src/game/city.ts:692).",
        "TOWN_POP = 1000 is the seed town's population (src/game/lots/seedtowns.ts:10).",
    ],
    below=["town.lots", "town.network", "town.traffic", "town.farms", "town.compose", "town.buildings"],
    above=["core", "business", "people", "ui"],
    rules=["town jams are the player's job (never auto-fix congestion)", "roads rebuild instantly, with no manual ground rebuild"],
)
