"""core.engine.orchestra: the Game's constructor, init and terrain setup (engine.ts), described: the engine file is owned here as one leaf."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.engine.orchestra", rung=3, title="Engine constructor and init",
    purpose="Build the Game from the canvas and boot options, load the terrain and the save, and start the frame loop.",
    requires=[
        "The constructor runs before init; init sets up the renderer, loads the map (genTerrain, useTerrain) and then the save or a new game.",
        "destroy stops the frame loop and the timers (engine.ts line 3414).",
    ],
    owns=["the Game's state fields (cam, props, traffic, golf, range, paint, the sim and the save timer)"],
    files=["src/game/engine.ts"],
    dynamics=[
        Fn(name="constructor", at="src/game/engine.ts:3032", does="builds the Game from the canvas, overlay and boot options", sig="constructor(canvas, overlay, boot)"),
        Fn(name="init", at="src/game/engine.ts:3149", does="sets up the renderer and loads the save or starts a game", sig="init(opts)"),
        Fn(name="useTerrain", at="src/game/engine.ts:3248", does="takes a terrain as the map and sets up its ground", sig="useTerrain(t, seed)"),
        Fn(name="destroy", at="src/game/engine.ts:3414", does="stops the frame loop, the timers and the workers", sig="destroy()"),
    ],
    inputs=["the canvas, the overlay canvas and BootOptions"],
    outputs=["a running Game (the frame loop started)"],
    tests=["tests/lab-boot.test.ts", "tests/dev-save-merge.test.ts", "tests/save.test.ts"],
    below=["core.boot.options", "core.save.io"], above=["core.engine", "core.tick.frame"],
    dual="destroy (stops the engine; the save is kept)",
    seams=["the Game's state shared with every domain (engine.ts fields)"],
    impl="describe",
)
