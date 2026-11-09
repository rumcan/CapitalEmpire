"""land.bake.layers: what one ground chunk draws in a frame (ground-layers.ts) and the messages between the bake and the workers (ground-protocol.ts)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.bake.layers", rung=3, title="Chunk layers and the bake protocol",
    purpose="Decide which pictures a chunk draws this frame (the picture at its zoom, the fallback, the top layer), and define the messages the bake sends.",
    requires=[
        "chunkLayers picks the picture for a chunk at zoom L, falling back while a picture is not ready.",
        "pictureCurrent says whether a picture still matches the zoom it was made at.",
        "prebakeTargets lists the chunks to bake ahead of the view, at the zoom levels in the view.",
        "ToWorker and FromWorker are the message types between the main thread and the bake workers.",
    ],
    owns=["ChunkPictures and ChunkLayers (ground-layers.ts)", "ToWorker and FromWorker (ground-protocol.ts:196, :266)", "the shine mask bytes (ShineMaskData)"],
    files=["src/game/ground-layers.ts", "src/game/ground-protocol.ts"],
    dynamics=[
        Fn(name="chunkLayers", at="src/game/ground-layers.ts:18", does="the pictures one chunk draws this frame", sig="chunkLayers(t, L, artL, zoomBlend)"),
        Fn(name="prebakeTargets", at="src/game/ground-layers.ts:41", does="the chunks to bake ahead of the view, at each zoom level", sig="prebakeTargets(v, lv, factors)"),
        Fn(name="ToWorker", at="src/game/ground-protocol.ts:196", does="the messages the main thread sends the workers", sig="type ToWorker"),
    ],
    inputs=["a chunk, the zoom and the view"], outputs=["the layers to draw, the chunks to bake, the messages"],
    tests=["tests/ground-layers.test.ts", "tests/zoom-prebake.test.ts", "tests/painted-tiles.test.ts", "tests/custom-grass.test.ts", "tests/lot-ground.test.ts"],
    below=["land.surfaces.families"], above=["land.bake.cache", "render"],
    dual="MISSING: a picture drawn for a frame is not undone; a stale picture is replaced when its zoom changes",
    seams=["the messages carry the lot patches, course layers and the shine masks"],
    rules=["no visible tiling", "performance is a hard gate"],
    impl="describe",
)
