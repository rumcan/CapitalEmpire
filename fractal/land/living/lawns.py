"""land.living.lawns: the town lawns (lawns.ts: lotLawn, blockLawn) and the grass condition picture over a lawn (lawn-overlay.ts grassOverlay)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.living.lawns", rung=3, title="Lawns and grass condition",
    purpose="Give each lot and each enclosed block a preset lawn, and show the grass condition over it (the owner heat and condition overlay).",
    requires=[
        "LAWN_IDS are the presets flagged as lawns; BLOCK_LAWN has soft 0.15 and patch 2.5.",
        "lotLawn picks a lot lawn from its key and the lot geometry; blockLawn picks a block lawn from the grass share.",
        "grassOverlay gives the condition overlay of a lawn; isLotLawn says whether a lot has a lawn.",
    ],
    owns=["LAWN_IDS (lawns.ts:13)", "BLOCK_LAWN (lawns.ts:15)"],
    files=["src/game/lawns.ts", "src/game/lawn-overlay.ts"],
    dynamics=[
        Fn(name="lotLawn", at="src/game/lawns.ts:24", does="a lot lawn picked from its key and geometry", sig="lotLawn(key, g, ...)"),
        Fn(name="blockLawn", at="src/game/lawns.ts:34", does="a block lawn picked from the grass share", sig="blockLawn(b, ids, grass)"),
        Fn(name="grassOverlay", at="src/game/lawn-overlay.ts:16", does="the grass condition overlay of a lawn", sig="grassOverlay(p, heat, tiled)"),
    ],
    inputs=["a lot or block and the grass condition"], outputs=["a lawn look and the overlay"],
    tests=["tests/lawns.test.ts", "tests/lawn-overlay.test.ts", "tests/lawns-by-state.test.ts", "tests/rough-yards.test.ts"],
    below=["land.surfaces.assign"], above=["land.bake.worker", "town"],
    dual="MISSING: a lot lawn is re-picked from its key; the old per-lot pick is not kept",
    seams=["lot states (built, unbuilt) come from town (STATE_LAWN in painted-surfaces.ts)"],
    rules=["no flat colour washes", "new art used everywhere", "a built house lot always has a house facing its street"],
    impl="describe",
)
