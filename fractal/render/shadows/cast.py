"""render.shadows.cast: the cast shadow's screen shear (cast-shadow.ts castShear), ported. Steer: the angle, length and strength from cast-shadow.json defaults."""
import math

from fractal.holon import Fn, Holon

STEER = {"angle": 145.0, "length": 0.9, "strength": 0.6, "on": True}


def cast_shear(angle: float | None = None, length: float | None = None, knobs: dict | None = None) -> dict:
    """the cast shadow's offset per unit of sprite height: sx, sy from its angle (degrees: 0 right, 90 down) and length"""
    k = knobs or STEER
    a = math.radians(k["angle"] if angle is None else angle)
    L = k["length"] if length is None else length
    return {"sx": L * math.cos(a), "sy": L * math.sin(a)}


HOLON = Holon(
    id="render.shadows.cast", rung=3, title="Cast shadow shear",
    purpose="Lay each upright sprite's silhouette on the ground, away from the sun, hinged at its foot.",
    requires=[
        "CAST_DEFAULT is on, angle 145, length 0.9, strength 0.6 (cast-shadow.ts line 10); castShear(c) = length times (cos, sin) of the angle.",
        "clampCast keeps the angle in 0..360, length 0.1..1.5 and strength 0..1 (CAST_RANGES).",
    ],
    owns=["the cast settings (cast-shadow.json: on, angle, length, strength)"],
    files=["src/game/cast-shadow.ts", "src/game/cast-shadow.json"],
    dynamics=[
        Fn(name="castShear", at="src/game/cast-shadow.ts:47", does="the screen shear of the cast shadow per unit height", sig="castShear(c: CastShadow): {sx, sy}"),
        Fn(name="clampCast", at="src/game/cast-shadow.ts:15", does="clamps a cast setting into its ranges", sig="clampCast(c)"),
        Fn(name="shadowMultiplier", at="src/game/cast-shadow.ts:28", does="the multiply colour the shadow layer darkens the ground with", sig="shadowMultiplier(a)"),
    ],
    inputs=["the saved cast settings (setCast in engine.ts)"],
    outputs=["sx, sy for the GPU shadow pass (gl.ts drawCast)"],
    tests=["tests/cast-shadow.test.ts", "tests/shadow-overrides.test.ts", "tests/axis-shadows.test.ts"],
    below=[], above=["render.shadows", "render.gl.shadows"],
    dual="setCast with on false (engine.ts setCast turns the cast off)",
    seams=["CastShadow settings shared with the lot bake (scripts/assets/lot-render.mjs)"],
    rules=["sun upper right, shadows 145 degrees"],
    impl="native", fn=cast_shear, steer=dict(STEER),
    params={"angle": "float, degrees (default steer 145)", "length": "float, shadow length per unit height (default 0.9)"},
)
