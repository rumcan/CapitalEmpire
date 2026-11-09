"""town: the roads and the network, the lots and what stands on them, the farms, the traffic and the town's growth (T410, #1110)."""
from fractal.holon import Holon

HOLON = Holon(
    id="town", rung=1, title="Town",
    purpose="Lay roads, cut them into lots, compose what stands on each lot, grow the town and send the traffic along its streets.",
    requires=[
        "A road edit rebuilds the network incrementally (RoadNetwork.rebuild, src/game/network.ts:733) and the lots follow it.",
        "A built house lot always has a house facing its street (tests/house-lots-have-houses.test.ts).",
        "Traffic is stepped on the lane graph every DT = 0.1 s (src/game/sim/sim.ts:17).",
        "Town growth falls with access: zoneGrowth is 1 below 1.3 and 0 above 1.8 (src/game/lots/town.ts:59).",
    ],
    below=["land", "render"], above=["core", "business", "people", "play", "course", "ui"],
    rules=[
        "roads rebuild instantly, with no manual ground rebuild",
        "town jams are the player's job (never auto-fix congestion)",
        "a built house lot always has a house facing its street",
        "new art used everywhere, with the old look kept as an option",
        "lit sprites are never mirrored",
        "the sun is at the upper right and shadows fall at 145 degrees",
        "performance is a hard gate",
    ],
)
