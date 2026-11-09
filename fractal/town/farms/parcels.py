"""town.farms.parcels: the farm parcels along the roads, and the composition of one farm. The farm composer is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: composeFarm (src/game/ext/farms/farms.ts:809) needs farmParcels (farms.ts:89, which reads the terrain class array), farmsteadOf (farms.ts:802) and the farm kit's pictures; the parcel bounds (farms.ts:30) are steer defaults"


def compose_farm(p, seed, look=None, knobs=None):
    """port todo: one farm's composition from its parcel and seed (Python port of composeFarm, src/game/ext/farms/farms.ts:809)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.farms.parcels", rung=3, title="Farm parcels and farm composition",
    purpose="Cut farm parcels along the town's roads at the edge, and compose each one's farmstead and fields.",
    requires=[
        "FARM_FRONT_MIN 30 to FARM_FRONT_MAX 80 and FARM_DEPTH_MIN 60 to FARM_DEPTH_MAX 150 tiles bound a parcel (src/game/ext/farms/farms.ts:30).",
        "seedForParcel gives each parcel its own seed from the world seed (src/game/ext/farms/farms.ts:52).",
        "FARM_MONTH = 9 is the month the farm's season is read in (src/game/ext/farms/farms.ts:537).",
    ],
    files=["src/game/ext/farms/farms.ts", "src/game/ext/farms/index.ts"],
    dynamics=[
        Fn(name="composeFarm", at="src/game/ext/farms/farms.ts:809", does="composes one farm from its parcel and seed", sig="composeFarm(p: FarmParcel, seed: number, look: FarmLook = {}): Composition"),
        Fn(name="farmParcels", at="src/game/ext/farms/farms.ts:89", does="the farm parcels along a road segment", sig="farmParcels(seg, cls: Uint8Array, seed): Farm[]"),
        Fn(name="farmsteadOf", at="src/game/ext/farms/farms.ts:802", does="the farmstead of a parcel", sig="farmsteadOf(p, seed, model)"),
        Fn(name="seedForParcel", at="src/game/ext/farms/farms.ts:52", does="a parcel's own seed from the world seed", sig="seedForParcel(p, worldSeed): number"),
        Fn(name="parcelsOverlap", at="src/game/ext/farms/farms.ts:62", does="whether two parcels overlap", sig="parcelsOverlap(p, q): boolean"),
    ],
    inputs=["a FarmParcel {key, o, u, n, w, d}", "the world seed", "an optional look"],
    outputs=["a farm Composition", "parcels along a road"],
    tests=["tests/ext-farms.test.ts", "tests/lot-presets-farm.test.ts", "tests/town-earnings.test.ts", "tests/painted-families.test.ts"],
    below=["town.network.graph", "town.lots.cut"], above=["town.farms.map"],
    dual="the farm drops out when its parcel stops being a farm: FarmMap reports it in removed (src/game/ext/farms/farmmap.ts:77)",
    seams=["the farm kit pictures (art)", "the animals and fields (town.farms.fields, town.farms.animals)"],
    rules=["no visible tiling", "new art used everywhere, with the old look kept as an option"],
    impl="native", fn=compose_farm, steer={"front_min": 30, "front_max": 80, "depth_min": 60, "depth_max": 150, "farm_month": 9}, port=PORT,
    params={"p": "{key, o: {x,y}, u: {x,y}, n: {x,y}, w, d} the farm parcel in tiles", "seed": "int, the world seed", "look": "optional look overrides"},
)
