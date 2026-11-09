"""town.compose: composing a lot: the props that stand on it, the ground under them, and the parts that make a lot a shop, a car park or a gas station."""
from fractal.holon import Holon

HOLON = Holon(
    id="town.compose", rung=2, title="Composing a lot",
    purpose="Turn one lot and its state into the pictures standing on it and the ground patches under them.",
    requires=[
        "A lot's composition is fixed by its seed: the same lot and state give the same props (ComposeState.seed, src/game/lots/compose-core.ts).",
        "A composition is props, ground patches and optional anchors (Composition, src/game/lots/compose-core.ts:32).",
        "A lot with no garage door has no drive (LotAnchors, src/game/lots/compose-core.ts).",
    ],
    below=["town.lots", "town.buildings", "town.network.offroad"], above=["town.audit", "town.growth.city", "render"],
    rules=[
        "a built house lot always has a house facing its street",
        "no flat colour washes",
        "no visible tiling",
        "new art used everywhere, with the old look kept as an option",
    ],
)
