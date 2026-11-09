"""render.lamps.reflect: the lit and specular pixel maths (lamp-reflect.ts), not ported yet: it needs the lit tables."""
from fractal.holon import Fn, Holon


def spec_falloff(x: float, y: float, w: float, h: float, inner: float, outer: float, oval: float = 1.0, knobs: dict | None = None) -> float:
    """the specular falloff at a pixel (not ported yet)"""
    raise NotImplementedError("render.lamps.reflect: port specFalloff, litAt and bakedPixel (src/game/lamp-reflect.ts:110, :35, :58)")


HOLON = Holon(
    id="render.lamps.reflect", rung=3, title="Lit and glint pixels",
    purpose="Light the baked ground pixels by the lamps' intensity, and draw the glints of a lamp's specular oval.",
    requires=[
        "Lit pixels follow the LIGHT_IB intensity table (12 steps) and the two pool shares 0.4 and 0.5 (lamp-reflect.ts).",
        "specFalloff is an oval falloff of the glint between an inner and an outer radius, with a camera falloff on the GPU (CAMERA_FALLOFF_GLSL).",
    ],
    owns=["the LIGHT_DMU and LIGHT_DSG tables", "SPEC_LOOK (inner 0.15, outer 1, strength 1, day 0.5, oval 3)"],
    files=["src/game/lamp-reflect.ts"],
    dynamics=[
        Fn(name="specFalloff", at="src/game/lamp-reflect.ts:110", does="the glint's falloff at a pixel", sig="specFalloff(x, y, w, h, inner, outer, oval)"),
        Fn(name="bakedPixel", at="src/game/lamp-reflect.ts:58", does="one baked ground pixel lit by two lamp pools", sig="bakedPixel(c, p, pool1, pool2)"),
        Fn(name="clampSpecLook", at="src/game/lamp-reflect.ts:101", does="clamps the glint settings", sig="clampSpecLook(s)"),
    ],
    inputs=["a pixel's colour and position", "the two pool intensities"],
    outputs=["the lit colour", "the glint strength"],
    tests=["tests/lamp-reflect.test.ts", "tests/water-glint.test.ts", "tests/swamp.test.ts"],
    below=["render.lamps.pool"], above=["render.lamps", "render.gl.frame"],
    dual="SPEC_LOOK strength 0 (the glint off)",
    impl="native", fn=spec_falloff,
    port="todo: port specFalloff first (inputs: pixel x, y, the size w, h, inner, outer, oval; output: the falloff; TS lamp-reflect.ts:110, with smooth from the same file), then litAt and bakedPixel (lamp-reflect.ts:35 and :58, LIGHT tables at :19 and :24)",
    params={"x": "float", "y": "float", "w": "float", "h": "float", "inner": "float", "outer": "float"},
)
