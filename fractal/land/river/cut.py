"""land.river.cut: the river swamp stops short of built ground (river-cut.ts drawRiverCut): a soft cut around roads and lots."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.river.cut", rung=3, title="River cut around built ground",
    purpose="Keep the river swamp from running into roads and lots, so built ground sits clear of the water.",
    requires=[
        "RIVER_CUT gives the clearance: 1.5 tiles around a road and 1 tile around a lot.",
        "drawRiverCut draws a soft cut over the swamp where the shapes of built ground are.",
    ],
    owns=["RIVER_CUT (river-cut.ts:7)"],
    files=["src/game/river-cut.ts"],
    dynamics=[Fn(name="drawRiverCut", at="src/game/river-cut.ts:25", does="draws the cut (soft by default) over the swamp for the road and lot shapes near a chunk", sig="drawRiverCut(g, s, soft = true): void")],
    inputs=["a canvas context and the road and lot shapes near a chunk"], outputs=["the cut drawn on the context"],
    tests=["tests/river-belts.test.ts"],
    below=["land.river.course"], above=["land.bake.worker"],
    dual="MISSING: a drawn cut is repainted on each bake; the ground re-bakes itself when roads or lots change",
    seams=["the road and lot shapes come from town (the renderer gathers them near a chunk)"],
    rules=["roads rebuild instantly, no manual ground rebuild"],
    impl="describe",
)
