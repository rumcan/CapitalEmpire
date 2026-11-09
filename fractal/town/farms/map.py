"""town.farms.map: the farm map: keeps the farms in step with the town's lots, composing the new ones and dropping the removed ones."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="town.farms.map", rung=3, title="Farm map in step with the lots",
    purpose="Follow the town's lots: compose a farm where a parcel becomes one, and drop its props and ground where it stops.",
    requires=[
        "EVENT_CLEAR = 150 tiles is the clearance from events (src/game/ext/farms/farmmap.ts:10).",
        "claimedLots counts the lots a farm claims (src/game/ext/farms/farmmap.ts:16).",
    ],
    files=["src/game/ext/farms/farmmap.ts"],
    dynamics=[
        Fn(name="FarmMap", at="src/game/ext/farms/farmmap.ts:78", does="the farm grid that follows the town's lots, reporting added and removed farms", sig="class FarmMap"),
        Fn(name="claimedLots", at="src/game/ext/farms/farmmap.ts:16", does="how many lots the farms claim", sig="claimedLots(lots): number"),
    ],
    inputs=["the town's lots (added, removed)"],
    outputs=["farms added (to compose) and removed (to drop)"],
    tests=["tests/ext-farms-map.test.ts"],
    below=["town.farms.parcels"], above=["town.growth.city"],
    dual="the removed list drops the farm's props and ground (src/game/ext/farms/farmmap.ts:77)",
    seams=["the town's lot updates (town.growth.city)"],
    rules=["town jams are the player's job (never auto-fix congestion)"],
    impl="describe",
)
