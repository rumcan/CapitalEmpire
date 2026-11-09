"""art.newart.swap: the new-art and old-art switch (newart.ts flags and lookOf), described: the URL flags are read from the page."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="art.newart.swap", rung=3, title="New-art swap",
    purpose="Decide per building whether its new picture, its stand-in or the old picture is drawn, from the URL flags and the art present.",
    requires=[
        "?newart draws buildings and trees as new art only; ?oldart draws the old pictures of buildings without their four views (newart.ts lines 26 to 34).",
        "lookOf is the one place a draw's picture and scale are decided; a building with no stand-in is hidden (newart.ts header).",
    ],
    owns=["the flags NEW_ART_ONLY, OLD_ART, NEW_BUILDINGS_ONLY"],
    files=[],
    dynamics=[
        Fn(name="lookOf", at="src/game/newart.ts:194", does="the picture, flip, scale and hidden state a drawn prop uses", sig="lookOf(d)"),
        Fn(name="drawnAsStandIn", at="src/game/newart.ts:141", does="whether an item is drawn as a stand-in", sig="drawnAsStandIn(item)"),
    ],
    inputs=["the page's URL flags (newart, oldart)", "a drawn prop"],
    outputs=["a Look {item, flip, scale, hidden, x, y} for the sprite packer"],
    tests=["tests/newart.test.ts", "tests/newart-default.test.ts", "tests/shop-variety.test.ts"],
    below=["art.newart.standins", "art.newart.sizes"], above=["render.sprites.pack", "core.engine.orchestra"],
    dual="?oldart (the old pictures for comparison, no save changes)",
    rules=["new art used everywhere", "the old look stays as an option"],
    impl="describe",
)
