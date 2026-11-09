"""render.sprites.pack: the instance packing of one prop (sprites.ts spriteRect, packSprite, packShadow). Not ported yet: the Drawable and LibItem tables come from art."""
from fractal.holon import Fn, Holon


def sprite_rect(d: dict, knobs: dict | None = None) -> list:
    """the screen rectangle of a drawn prop (not ported yet)"""
    raise NotImplementedError("render.sprites.pack: port spriteRect and packSprite (src/game/sprites.ts:69, :113)")


HOLON = Holon(
    id="render.sprites.pack", rung=3, title="Sprite instance packing",
    purpose="Pack one drawn prop into its instance floats: its rectangle, its atlas cell, its flip, its sway and its shadow.",
    requires=[
        "spriteRect returns the drawable's rectangle from its anchor, scale and the library's w, h, ax, ay (sprites.ts line 69).",
        "packSprite writes SPRITE_STRIDE 20 floats per instance into a preallocated Float32Array (no allocation in the pack).",
    ],
    owns=["the sway codes (swayOf)"],
    files=["src/game/sprites.ts"],
    dynamics=[
        Fn(name="spriteRect", at="src/game/sprites.ts:69", does="the screen rectangle of a drawn prop", sig="spriteRect(d0, out, o)"),
        Fn(name="packSprite", at="src/game/sprites.ts:113", does="writes one prop's sprite instance into the buffer", sig="packSprite(d0, out, o, i, j, alpha)"),
        Fn(name="packShadow", at="src/game/sprites.ts:172", does="writes one prop's shadow instance", sig="packShadow(d0, out, o, i, j, rect, h)"),
    ],
    inputs=["a Drawable (item, x, y, flip, scale)", "LIBRARY entries (art)"],
    outputs=["instance floats in a Float32Array"],
    tests=["tests/sizes.test.ts", "tests/spacing.test.ts", "tests/props-variety.test.ts", "tests/shadow-overrides.test.ts"],
    below=["art.library.index", "render.shadows.shape"], above=["render.sprites", "render.gl.frame"],
    dual=None, seams=["Drawable (types.ts) in; Float32Array out"],
    rules=["lit sprites are never mirrored", "sun upper right, shadows 145 degrees"],
    impl="native", fn=sprite_rect, port="todo: port spriteRect and packSprite (inputs: a Drawable dict {item, x, y, flip, scale} plus the library entry w, h, ax, ay; outputs: the 4-float rect and the 20-float instance; TS sprites.ts:69 and :113, the library in library.ts)",
    params={"d": "dict, a drawable {item, x, y, flip, scale}"},
)
