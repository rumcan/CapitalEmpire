"""town.network.offroad: the off-road links from a lot to the road: the approach, a grid path that avoids costly ground, and the main roads."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="town.network.offroad", rung=3, title="Off-road approaches",
    purpose="Find the road point a lot reaches, run its approach back from the road, and route a path across the ground to it.",
    requires=[
        "The default approach runs back APPROACH = 46 tiles from the road (src/game/offroad.ts:11, :65).",
        "gridPath searches at most maxSide = 192 tiles a side, with pad = 16 (src/game/offroad.ts:107).",
        "carRoad leaves out any segment whose class has noCars (src/game/offroad.ts:13).",
    ],
    files=["src/game/offroad.ts"],
    dynamics=[
        Fn(name="offRoadTo", at="src/game/offroad.ts:171", does="the road and grass path from the road to a point, or null", sig="offRoadTo(net, roads: Set<Seg>, e: Pt, cost: (x, y) => number): OffRoad | null"),
        Fn(name="approach", at="src/game/offroad.ts:65", does="the approach polyline running back from a road point", sig="approach(roads: Set<Seg>, at: RoadPoint, back = APPROACH): Pt[]"),
        Fn(name="gridPath", at="src/game/offroad.ts:107", does="a cheapest path across a grid of tiles under a cost function", sig="gridPath(a, b, cost, maxSide = 192, pad = 16): Pt[]"),
        Fn(name="mainRoads", at="src/game/offroad.ts:17", does="the set of car-carrying segments of the network", sig="mainRoads(net, ok = carRoad): Set<Seg>"),
    ],
    inputs=["the road network", "a lot's point (tiles)", "a cost function over tiles"],
    outputs=["an OffRoad (road and grass polylines)", "a grid path (Pt[])"],
    tests=["tests/offroad.test.ts"],
    below=["town.network.graph"], above=["town.lots.cut", "town.compose"],
    dual="none needed: a path is recomputed from the network on each use; nothing is stored",
    seams=["the lot's drive and path (town.compose)"],
    rules=["town jams are the player's job (never auto-fix congestion)"],
)
