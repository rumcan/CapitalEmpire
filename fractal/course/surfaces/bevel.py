"""course.surfaces.bevel: the cart-path bevel: the sun-lit rim and cast shadow drawn beside each cart path."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.surfaces.bevel", rung=3, title="Cart path bevel",
    purpose="Draw the cart paths with a lit rim and a cast shadow on the sun's side, so a path reads as laid ground and not a flat line.",
    requires=[
        "The rim is 0.11 and the cast shadow 0.09 of a tile wide (CART_RIM, CART_CAST).",
        "The shadow falls away from the sun at the upper right (fromSun).",
    ],
    files=["src/game/cart-bevel.ts"],
    dynamics=[
        Fn(name="drawPaths", at="src/game/cart-bevel.ts:41", does="draws the cart paths onto a canvas context", sig="drawPaths<I>(g, feats, M, step, col)"),
        Fn(name="cartRim", at="src/game/cart-bevel.ts:50", does="the lit rim of the paths", sig="cartRim<I>(g, m, feats, M, W, H, col, s)"),
        Fn(name="cartCast", at="src/game/cart-bevel.ts:58", does="the cast shadow of the paths", sig="cartCast<I>(g, feats, M, W, H, col)"),
    ],
    inputs=["path features", "an affine transform", "the sun direction"], outputs=["canvas drawing of the paths"],
    tests=["tests/cart-bevel.test.ts", "tests/kerb-face.test.ts", "tests/course-paths.test.ts"],
    below=["course.surfaces.looks"], above=["course.surfaces"],
    dual="a removed path is redrawn without its bevel (the paths are rebuilt from the course)",
    impl="describe", steer={"cart_rim": 0.11, "cart_cast": 0.09, "sun_from": "upper right"},
)
