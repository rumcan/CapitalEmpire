"""core.engine.overlay: the 2D overlay drawn on top of the GL scene (engine.ts drawOverlay and drawGroundOverlays), described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.engine.overlay", rung=3, title="2D overlay",
    purpose="Draw the markings on the map over the GL scene: the lanes, lots, signals, heat, the ghosts of what is being placed, and the labels.",
    requires=[
        "drawOverlay draws the overlay once a frame onto the overlay canvas, after the GL scene (engine.ts line 12649).",
        "The overlay's labels go through the label placer, so none overlap (render.labels).",
    ],
    owns=["the overlay canvas context and its cached paths"],
    files=[],
    dynamics=[
        Fn(name="drawOverlay", at="src/game/engine.ts:12649", does="draws the frame's overlay markings", sig="drawOverlay(now)"),
        Fn(name="drawGroundOverlays", at="src/game/engine.ts:12996", does="draws the overlays that sit on the ground", sig="drawGroundOverlays(ctx)"),
    ],
    inputs=["the engine state each frame", "the placed labels"],
    outputs=["the overlay canvas pixels"],
    tests=["tests/ui-grow-label.test.ts", "tests/golf-hole-card.test.ts", "tests/ui-shot-panel.test.ts"],
    below=["render.labels.collect", "render.painter.ground"], above=["core.engine.orchestra", "core.tick.frame"],
    dual=None,
    impl="describe",
)
