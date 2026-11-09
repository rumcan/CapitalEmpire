"""town.buildings.classes: the house classes (small, medium, large), the house allocations by road and state, and the base pads. Size class is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: sizeClassOf (src/game/lots/house-class.ts:59) needs footprintOf and ownerScaleOf (preset-art.ts:150, :165) and the scales table (scales.ts)"


def size_class_of(id, knobs=None):
    """port todo: 0, 1 or 2 for small, medium, large, or None (Python port of sizeClassOf, src/game/lots/house-class.ts:59)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.buildings.classes", rung=3, title="House classes, allocations and base pads",
    purpose="Class each house small, medium or large, let the owner allocate houses to roads and states, and raise each house on its base pad.",
    requires=[
        "sizeClassOf returns 0, 1 or 2 for small, medium and large, and null for other pictures (src/game/lots/house-class.ts:59).",
        "allows reads the owner's allocation for a house by road and state (src/game/lots/house-alloc.ts:46).",
        "clampAlloc rejects a bad allocation record (src/game/lots/house-alloc.ts:24).",
    ],
    files=[
        "src/game/lots/house-class.ts", "src/game/lots/house-alloc.ts", "src/game/lots/house-allocations.json",
        "src/game/lots/base-pad.ts", "src/game/lots/base-pad-data.ts",
    ],
    dynamics=[
        Fn(name="sizeClassOf", at="src/game/lots/house-class.ts:59", does="the size class of a house picture", sig="sizeClassOf(id: string): 0 | 1 | 2 | null"),
        Fn(name="houseFamily", at="src/game/lots/house-class.ts:51", does="the family a house picture belongs to", sig="houseFamily(id: string): string | null"),
        Fn(name="allows", at="src/game/lots/house-alloc.ts:46", does="whether a house may stand on a road in a state", sig="allows(f, id, road, state): boolean"),
        Fn(name="toggled", at="src/game/lots/house-alloc.ts:58", does="flips one road or state in a house's allocation", sig="toggled(a, what)"),
        Fn(name="basePad", at="src/game/lots/base-pad.ts:12", does="the base pad height of a house on a road", sig="basePad(id, road, s): number"),
    ],
    inputs=["a house picture id", "an allocation file", "a road and state"],
    outputs=["a size class", "allow or refuse", "a base pad height"],
    tests=["tests/house-alloc.test.ts", "tests/house-lots-have-houses.test.ts", "tests/street-base.test.ts", "tests/autolot.test.ts"],
    below=["town.lots.library"], above=["town.buildings.facing", "town.compose.lot"],
    dual="toggled(a, what) again flips a house's allocation back (src/game/lots/house-alloc.ts:58)",
    seams=["the allocation editor in the lot lab (dev, core)"],
    rules=["a built house lot always has a house facing its street"],
    impl="native", fn=size_class_of, steer={"small_max": 0, "medium_max": 1}, port=PORT,
    params={"id": "str, a house picture id"},
)
