"""town.compose.auto: the automatic lots: a lot composed from a template (house, corner, trailer, junk, shop, centre) when no preset fits. Auto-lot is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: autoLot (src/game/lots/autolot.ts:534) needs the Lay class (autolot.ts:89), templateOf (autolot.ts:37), the preset library and the lot frame; the big-lot test (autolot.ts:528) is ported as a steer default"


def auto_lot(lot, use, tier, seed, state="built", knobs=None):
    """port todo: an automatic lot from a template (Python port of autoLot, src/game/lots/autolot.ts:534)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.compose.auto", rung=3, title="Automatic lots from templates",
    purpose="Compose a lot from a template when no preset fits it: a house, a corner, a trailer, a junk yard, a shop or a centre.",
    requires=[
        "AUTO_TEMPLATES are house, corner, trailer, junk, shop and centre (src/game/lots/autolot.ts:34).",
        "A big lot is one at least 14 by 12 tiles (AUTO_LOT_W = 14, AUTO_LOT_D = 12, src/game/lots/autolot.ts:527).",
        "clearAutoLots empties the auto-lot cache so each lot is composed again (src/game/lots/autolot.ts:531).",
    ],
    files=["src/game/lots/autolot.ts"],
    dynamics=[
        Fn(name="autoLot", at="src/game/lots/autolot.ts:534", does="composes an automatic lot from its template, tier and seed", sig="autoLot(lot, use, tier, seed, state = 'built')"),
        Fn(name="templateOf", at="src/game/lots/autolot.ts:37", does="the template for a use and tier", sig="templateOf(use, tier, seed): AutoTemplate | null"),
        Fn(name="Lay", at="src/game/lots/autolot.ts:89", does="the layout builder an auto lot is laid with", sig="class Lay"),
        Fn(name="houseOnlyLot", at="src/game/lots/autolot.ts:568", does="a lot with only its house", sig="houseOnlyLot(lot, state, ids, gap, least)"),
        Fn(name="clearAutoLots", at="src/game/lots/autolot.ts:531", does="empties the auto-lot cache", sig="clearAutoLots(): void"),
    ],
    inputs=["a lot", "a preset use and tier", "a seed and a state"],
    outputs=["an automatic Composition"],
    tests=["tests/autolot.test.ts", "tests/autolot-grid.test.ts", "tests/autolot-straight.test.ts", "tests/town-carparks.test.ts", "tests/house-lots-have-houses.test.ts"],
    below=["town.compose.lot", "town.compose.parts"], above=["town.compose.lot"],
    dual="clearAutoLots (src/game/lots/autolot.ts:531) drops the cache, so the lot is composed afresh",
    seams=["the preset library (town.lots.library)"],
    rules=["a built house lot always has a house facing its street", "new art used everywhere, with the old look kept as an option"],
    impl="native", fn=auto_lot, steer={"auto_lot_w": 14, "auto_lot_d": 12}, port=PORT,
    params={"lot": "{o, u, n, w, d} the lot geometry", "use": "str, the preset use", "tier": "int 0..3", "seed": "int", "state": "str, built | upgraded | declined"},
)
