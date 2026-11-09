"""core.tick.perf: the frame's performance counters (engine.ts perf fields, the rolling frame times), described: the bench reads them."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.tick.perf", rung=3, title="Frame counters",
    purpose="Count each frame's time, split into the course, the lot flush, the planting and the draw, so a hitch shows where it is.",
    requires=[
        "The frame times are a rolling 60 (frameTimes), and the counters are updated once a frame after the draw (engine.ts line 12069).",
        "The lot-ground flush is at most LAMP_SYNC_MS apart (engine.ts flushLotGround).",
    ],
    owns=["engine.perf (fps, frameMs, cpuMs, drawMs, instances, draws, courseMs, plantMs)"],
    files=['src/game/release-buffer.ts'],
    dynamics=[Fn(name="perf", at="src/game/engine.ts:1081", does="the perf counters the bench and the HUD read", sig="perf = {fps, frameMs, cpuMs, drawMs, ...}")],
    inputs=["the frame's timings"],
    outputs=["engine.perf for bench.ts and the dev hooks"],
    tests=["tests/tile-cache.test.ts", "gate: npm run bench (the perf counters are its input)"],
    below=[], above=["core.tick.frame", "core.bench.scenes"],
    dual=None,
    rules=["performance is a hard gate"],
    impl="describe",
)
