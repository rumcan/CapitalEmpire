"""town.compose.legacy: the old layout (the look kept as an option): the legacy use layout, the generated lot layout and the item kinds. Generation is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: generateLayout (src/game/lots/lot-gen.ts:54) needs GenInput (lot-gen.ts:51: SectorLot, HouseClass, Model, taken boxes) and the learned model (town.lots.learn); itemKind (item-kinds.ts:47) can follow"


def generate_layout(g, seed, knobs=None):
    """port todo: the laid items of one lot from its generator input and a seed (Python port of generateLayout, src/game/lots/lot-gen.ts:54)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.compose.legacy", rung=3, title="Legacy layout and generated items",
    purpose="Keep the old layout and the generator for the lots that are not composed from presets, with the per-lot item counts.",
    requires=[
        "PER_LOT caps each kind per lot: 4 trees, 7 bushes, 3 flowerbeds, 5 props (src/game/lots/lot-gen.ts:26).",
        "generateLayout is seeded: the same seed gives the same layout (src/game/lots/lot-gen.ts:54).",
        "itemKind sorts a library item into one item kind (src/game/lots/item-kinds.ts:47).",
    ],
    files=["src/game/lots/legacy-layout.ts", "src/game/lots/lot-gen.ts", "src/game/lots/item-kinds.ts"],
    dynamics=[
        Fn(name="generateLayout", at="src/game/lots/lot-gen.ts:54", does="generates a lot's items from its sectors, class and model", sig="generateLayout(g: GenInput, r): LaidItem[]"),
        Fn(name="layoutOfUse", at="src/game/lots/legacy-layout.ts:367", does="the legacy layout of a use: props and patches", sig="layoutOfUse(lot, st): {props, patches}"),
        Fn(name="itemKind", at="src/game/lots/item-kinds.ts:47", does="the item kind of a library item", sig="itemKind(it, i, area?): ItemKind | null"),
        Fn(name="kindPools", at="src/game/lots/item-kinds.ts:77", does="the sprite pools by item kind", sig="kindPools(): Record<ItemKind, string[]>"),
    ],
    inputs=["a generator input (sector lot, class, model, taken boxes)", "a seed"],
    outputs=["laid items", "a use's legacy props and patches"],
    tests=["tests/lots-on-the-fly.test.ts", "tests/item-places.test.ts", "tests/lot-wizard.test.ts", "tests/kit.test.ts", "tests/people-not-placeable.test.ts"],
    below=["town.buildings.models", "town.lots.learn"], above=["town.compose.lot"],
    dual="none stored: each lot is recomputed; the legacy layout is the older option kept beside the new one",
    seams=["the learned model (town.lots.learn)"],
    rules=["new art used everywhere, with the old look kept as an option"],
    impl="native", fn=generate_layout, steer={"per_lot_tree": 4, "per_lot_bush": 7, "per_lot_flowerbed": 3, "per_lot_prop": 5}, port=PORT,
    params={"g": "the generator input (lot, class, model, taken boxes)", "seed": "int"},
)
