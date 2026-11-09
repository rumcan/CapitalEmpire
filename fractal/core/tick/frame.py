"""core.tick.frame: the frame loop (engine.ts frame) and the draw order (engine.ts draw), described: the sim is stepped here by the traffic update."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.tick.frame", rung=3, title="Frame loop and draw order",
    purpose="Each frame: step the golf round, the cards, the farms, the traffic, the money floats, the peds and the camera, then draw the scene in order.",
    requires=[
        "frame (line 12014) schedules the next frame before any work, and caps dt at 0.05 s.",
        "The traffic moves once per frame through traffic.update(now); the sim worker is the town's (sim/*.ts), not this leaf's.",
        "draw (line 12200) sets the planner, district and street tiers from the zoom, then the ground, the sprites, the shadows and the overlay in that order.",
    ],
    owns=["the frame's timers (the last frame time, the build particles, the perf counters)"],
    files=[],
    dynamics=[
        Fn(name="frame", at="src/game/engine.ts:12014", does="the frame loop: steps the world, then draws", sig="frame(now)"),
        Fn(name="draw", at="src/game/engine.ts:12200", does="draws the scene: the planner or the tiles, the sprites, the shadows, the overlay", sig="draw(now)"),
    ],
    inputs=["the animation frame time", "the camera and the keys"],
    outputs=["the drawn frame", "the perf counters (fps, frameMs, cpuMs, drawMs)"],
    tests=["tests/sim.test.ts", "tests/sim-townclock.test.ts", "tests/clock.test.ts"],
    below=["render.gl.frame", "render.iso.camera", "render.tone.grade"], above=["core.tick", "core.engine.overlay"],
    dual=None,
    rules=["performance is a hard gate"],
    impl="describe",
)
