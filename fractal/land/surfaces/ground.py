"""land.surfaces.ground: the painted ground on a chunk (painted-ground.ts PaintedGround) and the painted grass at three zoom levels (painted-grass-lod.ts)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.surfaces.ground", rung=3, title="Painted ground and grass levels",
    purpose="Lay the painted ground on a chunk: each level a periodic painting at its own metres, blended by zoom, with patches and a tone.",
    requires=[
        "grassDetailWeights blends the far, mid and near grass levels for a zoom L.",
        "grassPatches places the patch sprites over a box at a radius R; PATCH_ANGLES holds four angles.",
        "PaintedGround lays each level's picture across the chunk within SPRITE_BYTES (128 MB) of sprite memory.",
    ],
    owns=["SPRITE_BYTES (painted-ground.ts:13)", "TONE_WAVES, BLEND_WAVES and the patch tuning (painted-grass-lod.ts)", "MAX_PAINTED_SOURCES 16, MAX_PAINTED_CHAINS 6, PAINTED_MAX_PX 2048"],
    files=["src/game/painted-ground.ts", "src/game/painted-grass-lod.ts"],
    dynamics=[
        Fn(name="PaintedGround", at="src/game/painted-ground.ts:18", does="the class that lays the painted levels on a chunk", sig="class PaintedGround"),
        Fn(name="grassDetailWeights", at="src/game/painted-grass-lod.ts:29", does="the far, mid and near weights at zoom L", sig="grassDetailWeights(L)"),
        Fn(name="grassPatches", at="src/game/painted-grass-lod.ts:88", does="the patch sprites over a box", sig="grassPatches(box, R)"),
    ],
    inputs=["a chunk box, zoom L, the family pictures"], outputs=["the painted ground canvas for the chunk"],
    tests=["tests/painted-grass-lod.test.ts", "tests/painted-families.test.ts", "tests/tile-cache.test.ts"],
    below=["land.surfaces.families"], above=["land.bake.layers", "land.bake.worker"],
    dual="MISSING: a painted chunk is repainted, not undone; the old look is the option the Paint tool keeps",
    seams=["the picture budget (SPRITE_BYTES) is part of the 192 MB ground plus tiles gate"],
    rules=["no visible tiling", "no flat colour washes", "performance is a hard gate"],
    impl="describe",
)
