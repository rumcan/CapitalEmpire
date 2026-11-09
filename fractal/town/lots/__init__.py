"""town.lots: the lot cut from the road network, the preset library, the lot groups and the learning from samples."""
from fractal.holon import Holon

HOLON = Holon(
    id="town.lots", rung=2, title="Lots",
    purpose="Cut the frontage and block lots from the roads, and fill them from the preset library, the groups and what has been learned.",
    requires=[
        "SIZE gives each road class a [min, max] lot size table (src/game/lots/lots.ts:26).",
        "BLOCK_MIN_AREA = 9 and BLOCK_MAX_AREA = 160000 tiles bound the blocks that get block lots (src/game/blocks.ts:9, :11).",
    ],
    below=["town.network", "town.growth"], above=["town.compose", "town.audit", "town.buildings", "town.growth"],
    rules=["a built house lot always has a house facing its street", "town jams are the player's job (never auto-fix congestion)"],
)
