"""land.surfaces.assign: which painted family each surface of the game wears (painted-surfaces.ts) and the live copy the game is built with (painted-surfaces-live.ts)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.surfaces.assign", rung=3, title="Surface to painted look",
    purpose="Say which look each surface wears: golf, map, town, living ground and course walls, with lawns picked per lot.",
    requires=[
        "SURFACES lists every surface key with its group (Golf, Map, Town, Living ground, Course walls).",
        "clampSurfaces turns a saved surfaces file into a valid one (version 1, surfaces, lawns) and fills missing looks.",
        "lawnSlot picks a lawn look for a lot or a block from its weight; LAWN_SLOTS is 8.",
        "setPaintedSurfaces replaces the live surfaces and tells its subscribers.",
    ],
    owns=["SurfacesFile (painted-surfaces.ts:83)", "SURFACES and LAWN_SLOTS (painted-surfaces.ts:24, :86)", "the live surfaces copy (painted-surfaces-live.ts:24-38)"],
    files=["src/game/painted-surfaces.ts", "src/game/painted-surfaces-live.ts", "src/game/painted-surfaces.json"],
    dynamics=[
        Fn(name="clampSurfaces", at="src/game/painted-surfaces.ts:94", does="turns a saved surfaces file into a valid one", sig="clampSurfaces(f: unknown): SurfacesFile"),
        Fn(name="lookOfTex", at="src/game/painted-surfaces.ts:128", does="the look a texture wears in a file, through its preset", sig="lookOfTex(tex, file, presets)"),
        Fn(name="lawnSlot", at="src/game/painted-surfaces.ts:151", does="the lawn look a lot picks from its weight", sig="lawnSlot(pts, lawns)"),
        Fn(name="setPaintedSurfaces", at="src/game/painted-surfaces-live.ts:38", does="replaces the live surfaces file and tells the subscribers", sig="setPaintedSurfaces(f: unknown)"),
    ],
    inputs=["a surfaces file (saved or the default)"], outputs=["a clamped SurfacesFile, looks per texture"],
    tests=["tests/painted-families.test.ts", "tests/lawns-by-state.test.ts", "tests/course-painting.test.ts", "tests/paint-polish.test.ts", "tests/grass-shine.test.ts"],
    below=["land.surfaces.families"], above=["land.bake.cache", "ui"],
    dual="MISSING: the old look is kept as an option only where a preset keeps it (oldTeeSurfaces, oldMowSurfaces); a plain surface edit has no undo here",
    seams=["the file the Paint tool edits (ui) and the ground workers read"],
    rules=["new art used everywhere", "no flat colour washes", "no visible tiling"],
    impl="describe",
)
