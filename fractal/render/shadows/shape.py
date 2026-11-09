"""render.shadows.shape: the contact shadow shapes per library kind and their overrides (shadow-shape.ts), not ported yet."""
from fractal.holon import Fn, Holon


def shadow_shape(item: int, hx: float, hy: float, scale: float = 1.0, knobs: dict | None = None) -> dict:
    """the contact shadow shape of a library item (not ported yet)"""
    raise NotImplementedError("render.shadows.shape: port shadowShape and contactShadow (src/game/shadow-shape.ts:114, :164)")


HOLON = Holon(
    id="render.shadows.shape", rung=3, title="Contact shadow shapes",
    purpose="Give a sprite's contact shadow its shape: the kind's rule (walker, fence, vehicle, tree, building ...) plus the per-item overrides.",
    requires=[
        "SHADOW_KINDS lists twelve kinds; kindOf reads a library item's kind, with ruleKind and overrideOf as the per-item exceptions.",
        "CONTACT_LEAN is 15% of the lean, capped at 0.25 (shadow-shape.ts line 41).",
    ],
    owns=["the shadow override table (shadow-overrides.json)", "the shape table (shadow-shapes.json)"],
    files=["src/game/shadow-shape.ts", "src/game/shadow-shapes.json", "src/game/shadow-overrides.json"],
    dynamics=[
        Fn(name="shadowShape", at="src/game/shadow-shape.ts:114", does="the shadow shape of a library item at its footprint", sig="shadowShape(it, hx, hy, scale)"),
        Fn(name="contactShadow", at="src/game/shadow-shape.ts:164", does="the contact shadow of a placed sprite, lean included", sig="contactShadow(it, d, pic)"),
        Fn(name="overrideOf", at="src/game/shadow-shape.ts:63", does="the override for an item id, with its turn", sig="overrideOf(id)"),
    ],
    inputs=["a LibItem and its footprint", "a placed ShadowSpot"],
    outputs=["a ShadowShape or ContactShadow for gl.ts drawShadows"],
    tests=["tests/shadow-shape.test.ts", "tests/shadow-overrides.test.ts", "tests/kit.test.ts"],
    below=["art.library.index"], above=["render.shadows", "render.sprites.pack"],
    dual=None, seams=["LibItem (art) in; ShadowShape out"],
    rules=["sun upper right, shadows 145 degrees"],
    impl="native", fn=shadow_shape,
    port="todo: port shadowShape and contactShadow (inputs: a LibItem dict {id, kind, boxes}, footprint hx, hy, scale; outputs: the shape with its lean; TS shadow-shape.ts:114 and :164, the tables in shadow-shapes.json and shadow-overrides.json)",
    params={"item": "int, the library index (not ported yet)"},
)
