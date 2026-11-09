"""art.eight.types: the eight facing keys and the set shape (object-eight-types.ts), described: a type table with a few helpers."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="art.eight.types", rung=3, title="Eight-view types",
    purpose="Define the eight facing keys, the set and view shapes, and the anchor and footprint of an object at a heading.",
    requires=[
        "OBJECT_FACING_KEYS has eight keys: four normal (NE, SE, SW, NW) and four yaw8 (N, E, S, W) (line 5).",
        "The two families are two authored cameras: a yaw8 view is never a 2D rotation of a normal one (object-eight-types.ts header).",
    ],
    owns=["OBJECT_FACING_KEYS", "ObjectEightView and ObjectEightSet shapes"],
    files=["src/game/object-eight-types.ts"],
    dynamics=[
        Fn(name="objectFootprint", at="src/game/object-eight-types.ts:31", does="the footprint box of an object at a heading", sig="objectFootprint(width, depth, headingDegrees)"),
        Fn(name="objectAnchor", at="src/game/object-eight-types.ts:25", does="the anchor of an object's picture from its boxes", sig="objectAnchor(boxes, rect)"),
    ],
    inputs=["a facing key", "an object's width, depth and heading"],
    outputs=["the anchor and footprint boxes"],
    tests=["tests/object-eight.test.ts", "tests/straight-views.test.ts"],
    below=[], above=["art.eight.core", "art.eight.library"],
    dual=None,
    impl="describe",
)
