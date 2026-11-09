"""town.traffic.sim: the traffic simulation core (IDM on the lane graph, vehicles in fixed slots) and the router that picks a car's route."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="town.traffic.sim", rung=3, title="Traffic sim core and routing",
    purpose="Step every car on the lanes each tick, and route each car from its start to its goal by the cheapest road.",
    requires=[
        "The sim steps every DT = 0.1 s (src/game/sim/sim.ts:17).",
        "CLOSED_COST = 3600 prices a closed segment in the router (src/game/sim/routing.ts:23).",
        "QUEUE_HEADWAY = 2 is the queue's headway in the router (src/game/sim/routing.ts:21).",
    ],
    files=["src/game/sim/sim.ts", "src/game/sim/routing.ts"],
    dynamics=[
        Fn(name="Sim", at="src/game/sim/sim.ts:92", does="the traffic sim: cars in fixed slots on the lane graph", sig="class Sim"),
        Fn(name="step", at="src/game/sim/sim.ts:549", does="advances every car one tick: IDM following, signals, junctions", sig="step()"),
        Fn(name="Router", at="src/game/sim/routing.ts:78", does="routes a car by the cheapest road, with closures priced high", sig="class Router"),
        Fn(name="Heap", at="src/game/sim/routing.ts:32", does="the priority queue the router searches with", sig="class Heap"),
    ],
    inputs=["the lane graph", "the trips (town.traffic.demand)", "the closures and incidents"],
    outputs=["car positions for the frame", "routes", "the lane losses for the bottleneck report"],
    tests=["tests/sim.test.ts", "tests/town.test.ts", "tests/trips.test.ts", "tests/route-obstacles.test.ts"],
    below=["town.traffic.lanes", "town.traffic.drive", "town.traffic.signals", "town.traffic.demand", "town.traffic.incidents"],
    above=["town.growth.city", "core"],
    dual="closures are lifted: City.liftIncident (src/game/city.ts:915) and repairDisaster (src/game/city.ts:951)",
    seams=["the car frame the worker sends (src/game/sim/client.ts, core)"],
    rules=["town jams are the player's job (never auto-fix congestion)", "performance is a hard gate"],
    impl="describe",
)
