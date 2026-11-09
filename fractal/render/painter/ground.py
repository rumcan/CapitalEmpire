"""render.painter.ground: the GroundPainter class that paints the ground's colour layers (renderer.ts), described: the 2D canvas maths needs the browser."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.painter.ground", rung=3, title="Ground painter",
    purpose="Paint the baked ground: course surfaces, wall faces, banks and decals, with the shade mask and the spec and gloss masks.",
    requires=[
        "SHADE_MASK_K is 4: the shade mask is painted at 1/4 scale (renderer.ts line 419).",
        "takeShadeMask, takeSpecMask and takeGlossMask hand each mask over once (they return null after the take).",
    ],
    owns=["the ground's offscreen canvases (shade, spec, gloss, shine masks)"],
    files=["src/game/renderer.ts"],
    dynamics=[
        Fn(name="GroundPainter", at="src/game/renderer.ts:434", does="paints a ground tile's colour and its masks", sig="class GroundPainter"),
        Fn(name="takeShadeMask", at="src/game/renderer.ts:465", does="hands over the shade mask once", sig="takeShadeMask()"),
    ],
    inputs=["course paths, walls, banks, decals and surfaces from the course and town"],
    outputs=["the baked ground canvases and masks for tile-cache.ts"],
    tests=["tests/ground-stack.test.ts", "tests/river-belts.test.ts", "tests/desert-litter.test.ts", "tests/water-look.test.ts"],
    below=["render.painter.kerb"], above=["render.gl.frame", "land.bake"],
    dual=None, seams=["the ground's bake jobs (ground-protocol.ts) in; masks out"],
    rules=["no flat colour washes", "no visible tiling"],
    impl="describe",
)
