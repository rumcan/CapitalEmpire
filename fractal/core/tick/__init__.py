"""core.tick: the sim tick: the engine's frame loop, which moves the world and then draws it (engine.ts frame and draw) (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.tick", rung=2, title="Frame tick",
    purpose="Run once per animation frame: move the golfers, the traffic and the timers, then draw the frame, and count its time.",
    requires=[
        "The frame reschedules itself first (requestAnimationFrame), then steps the world, then draws (engine.ts frame, line 12014).",
        "dt is capped at 0.05 s per frame so a stalled tab does not jump the world (engine.ts frame).",
    ],
    below=["core.engine.orchestra", "render.gl.frame", "render.iso.camera", "town", "play", "people"], above=["core"],
    rules=["performance is a hard gate"],
)
