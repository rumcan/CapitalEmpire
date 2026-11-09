"""town.compose.parts: the parts that make a lot a car park, a gas station, a shopping centre or a shop lattice. Gas plan is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: gasPlan (src/game/lots/gas-station.ts:47) needs PresetProp and the shop ids; the bay size BAY_W = 2 and BAY_D = 2.75 (gas-station.ts:23) is ported as a steer default"


def gas_plan(w, d, canopy, shops, knobs=None):
    """port todo: the gas station's plan on a w by d lot (Python port of gasPlan, src/game/lots/gas-station.ts:47)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.compose.parts", rung=3, title="Car parks, gas stations, centres and shop variety",
    purpose="Lay the car park's bays, the gas station's bays and canopy, the shopping centre's shops, and vary the shops along a lattice.",
    requires=[
        "BAY_W = 2 and BAY_D = 2.75 tiles: a gas bay is 2 by 2.75 (src/game/lots/gas-station.ts:23).",
        "CENTRE_W = 24 and CENTRE_WMAX = 44 bound a shopping centre's width (src/game/lots/centre-biz.ts:14).",
        "LATTICE = 7 is the shop-variety lattice step (src/game/lots/variety.ts:19).",
    ],
    files=["src/game/lots/carpark-lot.ts", "src/game/lots/gas-station.ts", "src/game/lots/centre.ts", "src/game/lots/centre-biz.ts", "src/game/lots/variety.ts"],
    dynamics=[
        Fn(name="gasPlan", at="src/game/lots/gas-station.ts:47", does="the gas station's bays, canopy and shops on a lot", sig="gasPlan(w, d, canopy, shops): plan"),
        Fn(name="carPark", at="src/game/lots/carpark-lot.ts:38", does="the car park's rows on a span", sig="carPark(f, x0, x1, seed): CarPark"),
        Fn(name="layCarPark", at="src/game/lots/carpark-lot.ts:182", does="lays the car park's bays and aisles in a box", sig="layCarPark(L, box, seed, kit)"),
        Fn(name="centreLot", at="src/game/lots/centre.ts:79", does="composes a shopping centre lot", sig="centreLot(L, shops, kit, seed)"),
        Fn(name="findSpan", at="src/game/lots/centre-biz.ts:69", does="finds the free span a shopping centre can widen into", sig="findSpan(a, free)"),
        Fn(name="latticeOf", at="src/game/lots/variety.ts:65", does="the variety lattice cell of a lot", sig="latticeOf(lot): {cell, side, axis}"),
        Fn(name="colourOf", at="src/game/lots/variety.ts:71", does="a lot's shop colour index from its lattice cell", sig="colourOf(lot, n): number"),
    ],
    inputs=["a lot box or span", "a shop id list", "a seed"],
    outputs=["bays and aisles", "a shopping centre composition", "a shop per lattice cell"],
    tests=["tests/gas-station.test.ts", "tests/carpark.test.ts", "tests/carpark-angle.test.ts", "tests/shopping-centre.test.ts", "tests/shop-variety.test.ts", "tests/town-business.test.ts"],
    below=["town.compose.lot"], above=["town.compose.lot"],
    dual="none stored: the parts are recomputed from the lot's state; the bulldozer buy-out clears the lot (src/game/city.ts:1260)",
    seams=["the business records (business)"],
    rules=["new art used everywhere, with the old look kept as an option"],
    impl="native", fn=gas_plan, steer={"bay_w": 2, "bay_d": 2.75, "centre_w": 24, "centre_w_max": 44, "lattice": 7}, port=PORT,
    params={"w": "float, lot width tiles", "d": "float, lot depth tiles", "canopy": "the canopy preset prop", "shops": "list of shop ids"},
)
