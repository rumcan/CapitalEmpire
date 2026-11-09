"""art.newart.standins: the stand-in choice for a building (newart.ts standInCandidates, standInNeeds). Not ported yet: it reads the library and the family tables."""
from fractal.holon import Fn, Holon


def standin_candidates(item: int, k: float, knobs: dict | None = None) -> list:
    """the stand-ins a building may be drawn as at scale k (not ported yet)"""
    raise NotImplementedError("art.newart.standins: port standInCandidates, standIn and standInNeeds (src/game/newart.ts:108, :92, :117) with their family tables")


HOLON = Holon(
    id="art.newart.standins", rung=3, title="Stand-ins",
    purpose="Choose, for a building with no new picture yet, the new-art building of its family that fills its footprint best.",
    requires=[
        "standInFamily gives a building's family (trees are their own family; buildings in the art inventory only) (newart.ts line 60).",
        "standInCandidates lists the stand-ins a building may use at a scale; the nearest by size is preferred, within 10% of the nearest (newart.ts line 84).",
        "standInNeeds lists, per stand-in, the largest scale a building needs (newart.ts line 117), so the pack holds the pixels it needs.",
    ],
    owns=["the family table (standInFamily) and the per-building stand-in choice"],
    files=["src/game/newart.ts"],
    dynamics=[
        Fn(name="standInFamily", at="src/game/newart.ts:60", does="the stand-in family of an item, or null", sig="standInFamily(it)"),
        Fn(name="standInCandidates", at="src/game/newart.ts:108", does="the stand-ins a building may be drawn as at scale k", sig="standInCandidates(item, k)"),
        Fn(name="standInNeeds", at="src/game/newart.ts:117", does="the largest scale each stand-in is needed at", sig="standInNeeds()"),
    ],
    inputs=["a building's library index and its scale"],
    outputs=["candidate stand-in indices", "the needs record for the sprite packer"],
    tests=["tests/standin-needs.test.ts", "tests/standin-labels.test.ts", "tests/removed-standins.test.ts", "tests/newart.test.ts"],
    below=["art.library.views"], above=["art.newart.swap", "art.newart.sizes"],
    dual="?oldart puts the old picture back for comparison (newart.ts OLD_ART)",
    rules=["new art used everywhere", "the old look stays as an option"],
    impl="native", fn=standin_candidates,
    port="todo: port standInCandidates with standIn, standInFamily and standInNeeds (inputs: the library rows and a scale; outputs: the candidate indices and the needs map; TS newart.ts:60, :92, :108, :117, and the family tables above line 75)",
    params={"item": "int, the building's library index", "k": "float, the draw scale"},
)
