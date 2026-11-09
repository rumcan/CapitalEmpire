"""land.themes.planting: the desert planting (desert-planting.ts): the hole plants (palms and cacti), the desert frame of trees and the desert plant lists."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.themes.planting", rung=3, title="Desert planting",
    purpose="Plant the desert with its own plants: holes are dressed with desert plants, not the normal trees, and the trees of a frame are swapped.",
    requires=[
        "DESERT_HOLE_SETS lists the desert hole sets; isDesertHolePlant says whether an id is one of them.",
        "desertHolePlant picks a desert plant from a unit value u; spotU hashes a point to that unit value.",
        "desertFrameTree swaps a tree in a frame for its desert plant.",
    ],
    owns=["DESERT_HOLE_SETS and DESERT_HOLE_IDS (desert-planting.ts:21, :30)", "GROW (the growth table)"],
    files=["src/game/desert-planting.ts"],
    dynamics=[
        Fn(name="desertHolePlant", at="src/game/desert-planting.ts:39", does="a desert hole plant from a unit value", sig="desertHolePlant(u): string"),
        Fn(name="spotU", at="src/game/desert-planting.ts:48", does="a point hashed to a unit value", sig="spotU(x, y, salt)"),
        Fn(name="desertFrameTree", at="src/game/desert-planting.ts:54", does="swaps a frame tree for its desert plant", sig="desertFrameTree(t)"),
    ],
    inputs=["a point or a unit value and a frame tree"], outputs=["a desert plant id or a swapped tree"],
    tests=["tests/golf-range-desert.test.ts", "tests/waste-area-brush.test.ts", "tests/props-all.test.ts"],
    below=["land.themes.theme"], above=["course", "town"],
    dual="MISSING: a swapped tree is not swapped back; the normal planting returns when the desert toggle is off",
    seams=["the holes are planted by course (hole plans), the frame by town"],
    rules=["no visible tiling", "new art used everywhere"],
    impl="describe",
)
