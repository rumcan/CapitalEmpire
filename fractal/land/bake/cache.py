"""land.bake.cache: the main thread side of ground baking (ground-cache.ts GroundCache): which chunks are on screen, which are baked, and the messages to the workers."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.bake.cache", rung=3, title="Ground bake cache (main thread)",
    purpose="Know which ground chunks are on screen and which are baked, and send the workers the work: terrain, roads, lots, surfaces and the switches.",
    requires=[
        "GroundCache.terrain sends the terrain to every worker; init sends the first set of surfaces.",
        "invalidate marks a box stale and asks for it again; invalidateAll marks every tile stale.",
        "Every switch (grass shine, water motion, living ground, swamp) is a setter that broadcasts only when it changes.",
    ],
    owns=["Tile (a baked chunk: its generation, stale flag and hold)", "PROVISIONAL_RETRY_MS, PROVISIONAL_TRIES, COURSE_HOLD_MS, BAKE_LOG (ground-cache.ts:52-58)"],
    files=["src/game/ground-cache.ts", "src/game/tile-cache.ts"],
    dynamics=[
        Fn(name="GroundCache", at="src/game/ground-cache.ts:62", does="the class: the chunk table, the worker pool and the GL textures per chunk", sig="class GroundCache"),
        Fn(name="terrain", at="src/game/ground-cache.ts:307", does="sends the terrain (classes, heights, waterways) to every worker", sig="terrain(t)"),
        Fn(name="invalidate", at="src/game/ground-cache.ts:361", does="marks a box of chunks stale so they bake again", sig="invalidate(b, keepPrev = false, until = 0, kinds = 'gmp', hold = 0)"),
        Fn(name="setWaterMotion", at="src/game/ground-cache.ts:265", does="switches the water motion on or off in every worker", sig="setWaterMotion(on)"),
    ],
    inputs=["the terrain, roads, lots, surfaces and the switches from the engine"], outputs=["baked chunk textures for the renderer"],
    tests=["tests/tile-cache.test.ts", "tests/lamp-reflect.test.ts", "tests/swamp.test.ts", "tests/ext-course-height-land-light.test.ts", "tests/network.test.ts"],
    below=["land.bake.worker", "land.bake.layers"], above=["render", "core"],
    dual="invalidate with a new generation replaces a baked chunk; the switches set the old value back the same way",
    seams=["the engine (core) owns the GroundCache; render reads its textures"],
    rules=["roads rebuild instantly, no manual ground rebuild", "performance is a hard gate", "no visible tiling"],
    impl="describe",
)
