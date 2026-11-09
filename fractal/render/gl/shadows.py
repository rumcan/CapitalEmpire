"""render.gl.shadows: the shadow layer, MAX-blended then multiplied once (gl.ts, described under render.gl)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.gl.shadows", rung=3, title="Shadow layer",
    purpose="Darken the ground once for every shadow: overlaps take the darkest, and the texture stays under the shade.",
    requires=[
        "beginShadows opens an offscreen coverage layer; every shadow draws into it with MAX blending, so overlaps never multiply (T185).",
        "endShadows multiplies the ground once by the one cool shadow colour (cast-shadow.ts shadowMultiplier).",
    ],
    owns=["the shadow coverage target (gl.ts shade mask)"],
    files=[],
    dynamics=[
        Fn(name="beginShadows", at="src/game/gl.ts:750", does="opens the MAX-blended coverage layer", sig="beginShadows()"),
        Fn(name="endShadows", at="src/game/gl.ts:782", does="multiplies the ground by the coverage once", sig="endShadows()"),
        Fn(name="drawCast", at="src/game/gl.ts:798", does="draws the cast silhouettes for a range of sprites", sig="drawCast(firstFloat, count, sx, sy, strength, minPx)"),
        Fn(name="drawShadows", at="src/game/gl.ts:812", does="draws the contact shadow shapes for a range of sprites", sig="drawShadows(firstFloat, count, strength, shiftX, shiftY, minPx)"),
    ],
    inputs=["shadow instance ranges (SHADOW_STRIDE 16 floats)", "the cast shear from cast-shadow.ts castShear"],
    outputs=["the darkened ground in the scene target"],
    tests=["tests/shadow-cull.test.ts", "tests/cast-shadow.test.ts", "tests/shadow-vector.test.ts"],
    below=["render.shadows.cast", "render.shadows.shape"], above=["render.gl"],
    dual=None, seams=["Shadow instances (sprites.ts packShadow) in"],
    rules=["sun upper right, shadows 145 degrees", "no flat colour washes"],
    impl="describe",
)
