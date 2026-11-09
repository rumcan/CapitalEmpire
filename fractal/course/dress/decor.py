"""course.dress.decor: the decor the player places on the course: its groups, its items and their prices, the size of each, and the dressing of the tees and the trees."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.dress.decor", rung=3, title="Decor and dressing",
    purpose="The decor items on the course: plants, water, stone, desert, furniture, tournament and buildings, each priced and sized, plus the pins, tee markers and trees the course is dressed with.",
    requires=[
        "A decor item's size is clamped to 80% .. 120% (clampSize) and its price scales with the size (sizedPrice).",
        "The decor appeal values are fixed: a plant 0.01, a fountain 0.15, a statue 0.08 (APPEAL).",
        "Each tee set has its own tee marker prop, the four sharing TEE_MARKER_ID; the marker's scale is 0.18 to 0.32 (MARKER_SCALE).",
    ],
    files=["src/game/golf/decor.ts", "src/game/golf/dressing.ts"],
    dynamics=[
        Fn(name="sizedPrice", at="src/game/golf/decor.ts:203", does="the price of a decor item at a size", sig="sizedPrice(price, size = 1): number"),
        Fn(name="clampSize", at="src/game/golf/decor.ts:199", does="clamps a decor size to 80% .. 120%", sig="clampSize(s): number"),
        Fn(name="familyKey", at="src/game/golf/decor.ts:207", does="the family key of a decor item", sig="familyKey(d, id): string"),
        Fn(name="dressTree", at="src/game/golf/dressing.ts:41", does="picks a tree for a dressing point (conifer or broadleaf)", sig="dressTree(u): string"),
    ],
    inputs=["a decor item and a size", "a dressing point"], outputs=["a price", "a clamped size", "a prop id"],
    tests=["tests/golf-dressing.test.ts", "tests/golf-props-tool.test.ts", "tests/course-props.test.ts", "tests/props-all.test.ts", "tests/golf-facilities-props.test.ts"],
    below=["course.surfaces.grasses", "course.design.pieces"], above=["course.dress"],
    dual="a decor item is removed by its tool; the price is not refunded by a plain undo (unverified)",
    impl="describe", steer={"size_min": 0.8, "size_max": 1.2, "size_step": 0.05, "props_decay": 0.8, "pond_r": 3.5, "stone_price": 60},
)
