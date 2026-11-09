"""town.growth.names: road, town and place names drawn from the map seed (src/game/ext/names/)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="town.growth.names", rung=3, title="Road, town and place names",
    purpose="Seeded names for roads, towns, junctions, bridges, tunnels, stations and businesses: the same map seed names the same things.",
    requires=[
        "A map's names are a function of its seed and the inputs: the same seed and route keys name the same roads (names.ts:114 Names).",
        "Road names are unique within a town's scope: no duplicate road names in 2,000 draws per town (tests/ext-names.test.ts).",
        "A route keeps its name while its geometry does: routeKey is the geometry only (wiring.ts:12).",
    ],
    owns=["SETTINGS, the word lists by setting id (names.ts:13) and maple-valley.ts", "the per-map allocations of Names (names.ts:114 onward)"],
    files=["src/game/ext/names/index.ts", "src/game/ext/names/names.ts", "src/game/ext/names/maple-valley.ts", "src/game/ext/names/wiring.ts"],
    dynamics=[
        Fn(name="Names", at="src/game/ext/names/names.ts:114", does="the seeded generator: towns, roads, junctions, bridges, stations and businesses", sig="class Names(seed, setting)"),
        Fn(name="Names.road", at="src/game/ext/names/names.ts:215", does="a road's name by key, class and nearest town", sig="road(key, cls, nearTown?)"),
        Fn(name="Names.town", at="src/game/ext/names/names.ts:155", does="the name of town i", sig="town(i)"),
        Fn(name="Names.junction", at="src/game/ext/names/names.ts:232", does="a junction's name, the bigger road first", sig="junction(roadNames)"),
        Fn(name="RoadNames", at="src/game/ext/names/wiring.ts:27", does="one map's road-name cache, by route key and class", sig="class RoadNames(names, centres)"),
        Fn(name="routeKey", at="src/game/ext/names/wiring.ts:12", does="a route's geometry key (its points rounded to 0.01 tile)", sig="routeKey(pts)"),
        Fn(name="nearestTown", at="src/game/ext/names/wiring.ts:19", does="the nearest town centre within reach, or -1", sig="nearestTown(p, centres, reach)"),
    ],
    inputs=["the map seed", "route keys and road classes", "the town centres in tiles"],
    outputs=["road, town and place name strings for the HUD, the bottleneck list and the map labels"],
    tests=["tests/ext-names.test.ts", "tests/names-wiring.test.ts"],
    below=["town.network.graph"], above=["core.engine.orchestra"],
    dual="none needed: a name is derived from the seed and the route key, so a rebuilt network names its roads the same way",
    seams=["engine.ts:3250 builds Names and RoadNames from the seed and the town centres"],
    rules=[],
    impl="describe",
)
