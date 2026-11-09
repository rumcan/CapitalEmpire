"""town.buildings.models: the lot models v1 to v5, the layouts the composer reads by number (src/game/lots/lot-models/)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="town.buildings.models", rung=3, title="Lot models v1 to v5",
    purpose="Keep the versions of the lot model, the layouts each lot is placed by, and switch between them.",
    requires=[
        "LATEST is 5, the newest lot model (src/game/lots/lot-models/index.ts:11).",
        "LOT_MODELS maps version numbers 1 to 5 to their JSON (src/game/lots/lot-models/index.ts:9).",
        "setLotModel falls back to the newest model for an unknown version (src/game/lots/compose.ts:785).",
    ],
    files=[
        "src/game/lots/lot-models/index.ts", "src/game/lots/lot-models/v1.json", "src/game/lots/lot-models/v2.json",
        "src/game/lots/lot-models/v3.json", "src/game/lots/lot-models/v4.json", "src/game/lots/lot-models/v5.json",
    ],
    dynamics=[
        Fn(name="LOT_MODELS", at="src/game/lots/lot-models/index.ts:9", does="the lot model JSON by version", sig="const LOT_MODELS: Record<number, unknown>"),
        Fn(name="setLotModel", at="src/game/lots/compose.ts:785", does="selects the lot model version", sig="setLotModel(v: number): void"),
        Fn(name="layModelFrom", at="src/game/lots/compose.ts:806", does="reads a model's layout from its data", sig="layModelFrom(data, all = false): LayModel"),
    ],
    inputs=["a model version number"],
    outputs=["a model's layout data"],
    tests=["tests/clean-lots.test.ts", "tests/gas-station.test.ts", "tests/item-places.test.ts", "tests/lot-taste.test.ts", "tests/lots-every-use.test.ts", "tests/lots-on-the-fly.test.ts"],
    below=["town.buildings.classes"], above=["town.compose"],
    dual="setLotModel back to the earlier version (src/game/lots/compose.ts:785)",
    seams=["the lot model the composer reads (town.compose.lot)"],
    rules=["new art used everywhere, with the old look kept as an option"],
    impl="describe",
)
