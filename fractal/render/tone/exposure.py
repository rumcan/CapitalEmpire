"""render.tone.exposure: a look's exposure from its saved tone fields (exposure.ts exposureOf), ported. Steer: the limits and the strength range."""
from fractal.holon import Fn, Holon

STEER = {"min": 0.5, "max": 2.0}


def exposure_of(tone: int | None = None, amt: float | None = None, knobs: dict | None = None) -> float:
    """a look's exposure: none 1; darker (tone 1) at strength a is 1 - a, at least min; lighter (tone 2) is 1 + a, at most max"""
    k = knobs or STEER
    a = min(1.0, max(0.0, amt)) if amt is not None else 0.0
    if tone == 1:
        return max(k["min"], 1 - a)
    if tone == 2:
        return min(k["max"], 1 + a)
    return 1.0


HOLON = Holon(
    id="render.tone.exposure", rung=3, title="Exposure",
    purpose="Turn a look's saved tone (darker or lighter, and how much) into one exposure factor the picture is drawn at.",
    requires=[
        "exposureOf(tone, amt) is 1 when tone is none; darker is max(0.5, 1 - amt); lighter is min(2, 1 + amt) (exposure.ts line 19).",
        "toneOfExposure gives tone 0 at the default strength 0.35 when the exposure changes nothing (exposed() is false within 0.005 of 1).",
    ],
    owns=["the exposure limits (0.5 to 2)"],
    files=["src/game/exposure.ts"],
    dynamics=[
        Fn(name="exposureOf", at="src/game/exposure.ts:19", does="a look's exposure from its tone fields", sig="exposureOf(tone, amt)"),
        Fn(name="toneOfExposure", at="src/game/exposure.ts:26", does="the saved tone fields for an exposure", sig="toneOfExposure(f)"),
        Fn(name="exposeDraw", at="src/game/exposure.ts:47", does="draws a fill at the exposure on a 2D context", sig="exposeDraw(g, f, paint, draw, k)"),
    ],
    inputs=["a look's tone (0, 1, 2) and strength"],
    outputs=["the exposure factor", "the saved tone fields"],
    tests=["tests/t261-tone-exposure.test.ts"],
    below=[], above=["render.tone", "core.engine.orchestra"],
    dual="toneOfExposure with exposure 1 (tone 0: none)",
    impl="native", fn=exposure_of, steer=dict(STEER),
    params={"tone": "int, 0 none, 1 darker, 2 lighter", "amt": "float, strength 0..1"},
)
