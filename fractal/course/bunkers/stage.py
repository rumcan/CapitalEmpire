"""course.bunkers.stage: the bunker stage: the baker worker that paints each bunker's floor, wall and lip into an atlas, its cache and its ownership."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.bunkers.stage", rung=3, title="Bunker stage baker",
    purpose="Bake each bunker's floor, wall and lip off the main thread into one atlas picture, keep the picture in a small cache, and say which stage owns which point of the course.",
    requires=[
        "A bunker stage is one of floor, wall or lip (BUNKER_STAGES), and each is a rectangle of the atlas (bunkerStageRect).",
        "The stage cache holds at most 32 MiB (BUNKER_STAGE_CACHE_BYTES) and is suspended after a 3 s hold (BUNKER_SUSPEND_HOLD_MS).",
        "A point belongs to a bunker stage only when the stage's rings contain it (bunkerOwnsPoint).",
    ],
    files=[
        "src/game/ext/bunker-look/stage-atlas.ts",
        "src/game/ext/bunker-look/stage-bridge.ts",
        "src/game/ext/bunker-look/stage-client.ts",
        "src/game/ext/bunker-look/stage-materials.ts",
        "src/game/ext/bunker-look/stage-ownership.ts",
        "src/game/ext/bunker-look/stage-registry.ts",
        "src/game/ext/bunker-look/stage-types.ts",
        "src/game/ext/bunker-look/stage.worker.js",
        "src/game/ext/bunker-look/stage-baker/bake.js",
        "src/game/ext/bunker-look/stage-baker/renderer-world.d.ts",
        "src/game/ext/bunker-look/stage-baker/renderer-world.js",
        "src/game/ext/bunker-look/stage-baker/terrain-field.js",
        "src/game/ext/bunker-look/stage-baker/wall-renderer.js",
    ],
    dynamics=[
        Fn(name="BunkerStageBridge", at="src/game/ext/bunker-look/stage-bridge.ts:35", does="the main-thread bridge that sends bunker stage requests and takes the atlases back", sig="class BunkerStageBridge"),
        Fn(name="BunkerStageRegistry", at="src/game/ext/bunker-look/stage-registry.ts:18", does="the registry of the bunker stages that are baked", sig="class BunkerStageRegistry"),
        Fn(name="activeBunkerStages", at="src/game/ext/bunker-look/stage-ownership.ts:37", does="the stages that are on screen and ready", sig="activeBunkerStages(courses, refs, ready)"),
        Fn(name="packBunkerStageAtlas", at="src/game/ext/bunker-look/stage-atlas.ts:16", does="packs the floor, wall and lip pictures into one atlas", sig="packBunkerStageAtlas(colour, semantics, width, ...)"),
        Fn(name="BunkerStageBaker", at="src/game/ext/bunker-look/stage-client.ts:5", does="the client that asks the stage worker to bake", sig="class BunkerStageBaker"),
    ],
    inputs=["bunker stage requests: rings, source patch keys, materials"], outputs=["stage atlases (ImageBitmap)", "ready stages", "owned points"],
    tests=["tests/ext-bunker-stage-bridge.test.ts", "tests/ext-bunker-stage-atlas.test.ts", "tests/ext-bunker-stage-ownership.test.ts"],
    below=["course.bunkers.look"], above=["course.bunkers", "render"],
    dual="a stage is dropped from the cache when its bunker changes (the registry releases it); no undo of the picture is needed",
    impl="describe", steer={"stage_cache_bytes": 33554432, "suspend_hold_ms": 3000, "stages": ["floor", "wall", "lip"]},
)
