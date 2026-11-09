"""town.growth.plan: the plan of new roads, the districts and the seed towns. Ports inCommercial (src/game/lots/districts.ts:18)."""
import math

from fractal.holon import Fn, Holon

STEER = {
    "com_classes": ["avenue", "road", "arterial", "boulevard", "six", "grand", "divided"],
    "com_radius": 100, "ind_blocks": 2, "town_blocks": 8, "town_pop": 1000,
}


def in_commercial(lot_centre, seg_class_id, town_centre, knobs=None):
    """whether a lot fronting a street of this class, within com_radius tiles of the town centre, is in the commercial district"""
    k = {**STEER, **(knobs or {})}
    if seg_class_id not in k["com_classes"]:
        return False
    d = math.hypot(lot_centre["x"] - town_centre["x"], lot_centre["y"] - town_centre["y"])
    return d <= k["com_radius"]


HOLON = Holon(
    id="town.growth.plan", rung=3, title="Growth plan: districts and seed towns",
    purpose="Plan where the town's commercial and industrial districts sit, and where a seed town starts.",
    requires=[
        "COM_DIST_RADIUS = 100 tiles bounds the commercial district (src/game/lots/districts.ts:12).",
        "COM_CLASSES are the avenue, road, arterial, boulevard, six, grand and divided classes (src/game/lots/districts.ts:7).",
        "TOWN_POP = 1000 is the seed town's population and TOWN_BLOCKS = 8 its grid (src/game/lots/seedtowns.ts:8, :10).",
    ],
    files=["src/game/lots/roads.ts", "src/game/lots/seedtowns.ts", "src/game/lots/districts.ts"],
    dynamics=[
        Fn(name="inCommercial", at="src/game/lots/districts.ts:18", does="whether a lot is in the commercial district of the town centre", sig="inCommercial(lotCentre: Pt, segClassId: string, townCentre: Pt): boolean"),
        Fn(name="industrialRect", at="src/game/lots/districts.ts:24", does="the industrial rectangle at the grid corner nearest the entry (not yet ported)", sig="industrialRect(townCentre, entry, n = TOWN_BLOCKS)"),
        Fn(name="planExtension", at="src/game/lots/roads.ts:236", does="the road legs that extend the town (not yet ported)", sig="planExtension(c: RoadPlanCtx): Leg[] | null"),
        Fn(name="townCentres", at="src/game/lots/seedtowns.ts:13", does="the centres of the terrain's town sites (not yet ported)", sig="townCentres(t): Pt[]"),
    ],
    inputs=["a lot centre {x, y}", "a street class id", "the town centre {x, y}"],
    outputs=["a commercial yes/no"],
    tests=["tests/roads-grown.test.ts", "tests/town-districts.test.ts", "tests/seedtowns.test.ts"],
    below=["town.network.graph"], above=["town.growth.city"],
    dual="none stored: the plan is recomputed each growth; a road the player removes is undone by the journal (town.network.edit)",
    seams=["the districts the lots read (town.lots.cut)"],
    rules=["town jams are the player's job (never auto-fix congestion)"],
    impl="native", fn=in_commercial, steer=STEER,
    port="todo: planExtension (src/game/lots/roads.ts:236, needs the RoadNetwork), industrialRect (src/game/lots/districts.ts:24) and townCentres (src/game/lots/seedtowns.ts:13); inCommercial is ported",
    params={"lot_centre": "{x, y} tiles", "seg_class_id": "str, the street's class id", "town_centre": "{x, y} tiles"},
)
