"""town.network: the road graph (classes, nodes, segments), its junctions, kerbs and off-road links, and the edits and undo that change it."""
from fractal.holon import Holon

HOLON = Holon(
    id="town.network", rung=2, title="Roads and the network",
    purpose="The roads the player lays: their classes, nodes and segments, junction types, kerbs, off-road approaches, and every edit with its undo.",
    requires=[
        "The road classes come from one table, and an unknown class id falls back to 'street' (classOf, src/game/network.ts:111).",
        "A road edit is one journal step, and applyNetDiff with undo=true reverts it (src/game/net-undo.ts:69).",
    ],
    below=["land"], above=["town.lots", "town.traffic", "town.growth", "render", "ui"],
    rules=["roads rebuild instantly, with no manual ground rebuild", "town jams are the player's job (never auto-fix congestion)"],
)
