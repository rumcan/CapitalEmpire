"""render.iso.camera: the camera: zoom about a point, look at a point, and the ease to it (engine.ts, described; the camera state lives in the engine)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.iso.camera", rung=3, title="Camera",
    purpose="Move the view: pan with the arrows, zoom about the pointer, look at a place and ease there, and follow a car or a golfer.",
    requires=[
        "zoomAt clamps the zoom with the zoom floor (engine.ts zoomAt) and keeps the point under the pointer fixed.",
        "lookAt sets the camera centre; stepCamEase eases it from its current place to the target over frames.",
    ],
    owns=["the camera (cam: X, Y, z) and the ease target (camEase)"],
    files=[],
    dynamics=[
        Fn(name="zoomAt", at="src/game/engine.ts:6454", does="zooms about a screen point, keeping that point under the pointer", sig="zoomAt(z, mx, my)"),
        Fn(name="lookAt", at="src/game/engine.ts:6472", does="centres the camera on a world point, with an optional zoom", sig="lookAt(x, y, z)"),
        Fn(name="stepCamEase", at="src/game/engine.ts:6446", does="eases the camera toward its target each frame", sig="stepCamEase(now)"),
    ],
    inputs=["the pointer, the arrow keys, a selected place"],
    outputs=["cam.X, cam.Y, cam.z read by the draw"],
    tests=["tests/holeview.test.ts", "tests/golf-watch-speed.test.ts", "tests/golf-walkserve.test.ts"],
    below=["render.iso.projection"], above=["core.tick.frame", "ui"],
    dual="zoomAt back to the previous zoom (the ease reverses)",
    impl="describe",
)
