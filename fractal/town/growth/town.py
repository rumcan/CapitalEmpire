"""town.growth.town: the growth rings and the access factor that decide where the town grows. Ports grownRing and zoneGrowth (src/game/lots/town.ts:54-59)."""
import math

from fractal.holon import Fn, Holon

STEER = {"ring0": 120, "ring_k": 12, "zone_low": 1.3, "zone_high": 1.8, "target": [0, 0.65, 0.2, 0.1, 0.05]}


def grown_ring(dc, built, knobs=None):
    """the falloff of a lot dc tiles from the anchored centre with `built` lots built: exp(-dc / (ring0 + ring_k * sqrt(built)))"""
    k = {**STEER, **(knobs or {})}
    return math.exp(-dc / (k["ring0"] + k["ring_k"] * math.sqrt(max(0, built))))


def zone_growth(a, knobs=None):
    """the growth factor from access a: 1 below zone_low, linear down to 0 at zone_high, 0 above"""
    k = {**STEER, **(knobs or {})}
    lo, hi = k["zone_low"], k["zone_high"]
    if a < lo:
        return 1.0
    if a >= hi:
        return 0.0
    return (hi - a) / (hi - lo)


HOLON = Holon(
    id="town.growth.town", rung=3, title="Town lots and growth rings",
    purpose="Decide how fast each lot grows, from its distance to the built centre and the access it has.",
    requires=[
        "zoneGrowth is 1 below access 1.3 and 0 above 1.8, linear between (src/game/lots/town.ts:59).",
        "grownRing falls off exponentially with distance dc, with GROWN_RING0 = 120 and GROWN_RING_K = 12 (src/game/lots/town.ts:54; src/game/event/config.ts:140).",
        "The base target shares by use are 0.65, 0.2, 0.1 and 0.05 for residential, commercial, industrial and tourist (src/game/lots/town.ts:56).",
    ],
    files=["src/game/lots/town.ts", "src/game/lots/tiers.ts"],
    dynamics=[
        Fn(name="grownRing", at="src/game/lots/town.ts:54", does="the growth ring falloff of a lot at distance dc from the centre", sig="grownRing(dc: number, built: number): number"),
        Fn(name="zoneGrowth", at="src/game/lots/town.ts:59", does="the access growth factor, 1 to 0", sig="zoneGrowth(a: number): number"),
        Fn(name="Town", at="src/game/lots/town.ts:80", does="the town's lot states, growth and residents (not yet ported)", sig="class Town"),
        Fn(name="tierOf", at="src/game/lots/tiers.ts:21", does="the building tier of a picture id (not yet ported)", sig="tierOf(id: string): number"),
    ],
    inputs=["distance dc in tiles", "built lot count", "access factor a"],
    outputs=["a ring factor 0..1", "a growth factor 0..1"],
    tests=["tests/town.test.ts", "tests/town-grown.test.ts", "tests/town-business.test.ts", "tests/lot-tiers.test.ts", "tests/town-earnings.test.ts"],
    below=["town.lots.cut"], above=["town.growth.city"],
    dual="Town.clear (src/game/lots/town.ts:218): the player's bulldozer buy-out takes a built lot back to EMPTY and holds it for 2 game days",
    seams=["the lot states the sim reads (town.traffic.sim)"],
    rules=["town jams are the player's job (never auto-fix congestion)"],
    impl="native", fn=grown_ring, steer=STEER,
    port="todo: Town (src/game/lots/town.ts:80) and tierOf/townTier (src/game/lots/tiers.ts:21, :30); grownRing and zoneGrowth are ported",
    params={"dc": "float, tiles from the anchored centre", "built": "int, built lot count"},
)
