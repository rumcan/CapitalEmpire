"""land.bake.worker: the ground worker (ground.worker.ts): paints each ground chunk on an OffscreenCanvas and answers the main thread."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.bake.worker", rung=3, title="Ground bake worker",
    purpose="Paint the ground in a Web Worker so the main thread never waits for it: each chunk is painted from the terrain, the roads, the lots and the surfaces.",
    requires=[
        "The worker holds the terrain class grid and a RoadNetwork; it paints chunks on demand and when idle.",
        "A paint message is queued and handled in order; the idle work runs after IDLE_MS of quiet.",
        "The worker reports memory (memProbe) so the ground plus tiles stays within its budget (ground plus tiles is at most 192 MB).",
    ],
    owns=["the worker's terrain grid, road network and painter (ground.worker.ts:25-29)", "recentPaints (the paint queue)"],
    files=["src/game/ground.worker.ts", "src/game/texture-share.ts"],
    dynamics=[
        Fn(name="onmessage", at="src/game/ground.worker.ts:284", does="the message entry: init, terrain, roads, paint and the rest of the ToWorker messages", sig="scope.onmessage = (e: MessageEvent<ToWorker>)"),
        Fn(name="idleWork", at="src/game/ground.worker.ts:321", does="paints the chunks that were asked for while the worker was busy", sig="idleWork()"),
        Fn(name="memProbe", at="src/game/ground.worker.ts:353", does="the worker memory figures the main thread reads", sig="memProbe(): Record<string, number>"),
    ],
    inputs=["ToWorker messages (ground-protocol.ts)"], outputs=["FromWorker messages with painted chunks and stats"],
    tests=["tests/network.test.ts", "tests/tile-cache.test.ts", "tests/river-belts.test.ts", "tests/terrain-paint.test.ts", "tests/lab-boot.test.ts"],
    below=["land.bake.layers", "land.surfaces.assign", "land.living.influence", "land.relief.paint", "land.river.cut", "land.water.map", "land.water.look"],
    above=["land.bake.cache", "render"],
    dual="MISSING: a painted chunk is replaced by the next paint of it, not undone; a bake is a cache, so clearing it costs a re-bake",
    seams=["terrain, roads, lots and surfaces arrive by message from the main thread (GroundCache)"],
    rules=["roads rebuild instantly, no manual ground rebuild", "performance is a hard gate", "no visible tiling"],
    impl="describe",
)
