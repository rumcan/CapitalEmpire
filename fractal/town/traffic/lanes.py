"""town.traffic.lanes: the lane graph the cars drive on: links, connectors and rings, with a control at each crossing."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="town.traffic.lanes", rung=3, title="Lane graph",
    purpose="Build the lanes the cars drive on from the road network, with the control at each crossing, and find a car's place on them.",
    requires=[
        "Lane kinds are link, connector and ring (LK, src/game/sim/lanes.ts:11).",
        "Controls are free, yield, stop and signal (CTL, src/game/sim/lanes.ts:14).",
        "checkGraph returns the problems in a lane graph, an empty list when it is sound (src/game/sim/lanes.ts:619).",
    ],
    files=["src/game/sim/lanes.ts"],
    dynamics=[
        Fn(name="LaneGraph", at="src/game/sim/lanes.ts:190", does="the lanes built from the road network", sig="class LaneGraph"),
        Fn(name="checkGraph", at="src/game/sim/lanes.ts:619", does="the problems in a lane graph", sig="checkGraph(g: LaneGraph): string[]"),
        Fn(name="nearestLink", at="src/game/sim/lanes.ts:661", does="the lane link nearest a point", sig="nearestLink(g, x, y): {id, s} | null"),
        Fn(name="laneAt", at="src/game/sim/lanes.ts:650", does="a point and heading at a distance along a lane", sig="laneAt(l, s, out)"),
    ],
    inputs=["the road network (via the lane builder)", "a point in tiles"],
    outputs=["the lane graph", "problems", "a lane position"],
    tests=["tests/lanes.test.ts", "tests/bottlenecks.test.ts", "tests/gaps.test.ts"],
    below=["town.network.graph"], above=["town.traffic.sim", "town.traffic.signals"],
    dual="none stored: the lane graph is rebuilt from the road network on the next graph update (src/game/city.ts:692)",
    seams=["the road network the lanes are built from (town.network)"],
    rules=["roads rebuild instantly, with no manual ground rebuild"],
    impl="describe",
)
