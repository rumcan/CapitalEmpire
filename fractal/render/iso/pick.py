"""render.iso.pick: picking: the tile under a screen point, and the screen point of a tile (engine.ts tileAt, screen), described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.iso.pick", rung=3, title="Picking",
    purpose="Find the world tile under the pointer, and the screen point of a world tile, for every click and hover.",
    requires=["tileAt(mx, my) is the inverse of screen(x, y) for the current camera and dpr (engine.ts lines 3424 and 3428)."],
    owns=["nothing: it reads the camera and the canvas size"],
    files=[],
    dynamics=[
        Fn(name="tileAt", at="src/game/engine.ts:3424", does="the world tile under a screen point", sig="tileAt(mx, my)"),
        Fn(name="screen", at="src/game/engine.ts:3428", does="the screen point of a world tile", sig="screen(x, y)"),
    ],
    inputs=["a pointer position in CSS px"],
    outputs=["a world tile or a screen point"],
    tests=["tests/holeview.test.ts", "tests/golf-hole-card.test.ts", "tests/course-paths.test.ts"],
    below=["render.iso.projection", "render.iso.camera"], above=["ui", "core.engine.orchestra"],
    dual=None,
    impl="describe",
)
