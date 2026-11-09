"""town.growth.city: the City: the engine that ties the roads, lots, traffic, farms, businesses and disasters into one town, stepped each tick."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="town.growth.city", rung=3, title="City engine",
    purpose="Hold one town: apply the player's road ops, step the lots, traffic and growth each tick, and report the events and money.",
    requires=[
        "City.netOps applies road ops and returns the lots added and removed (src/game/city.ts:692).",
        "City.step advances the town and reports noRoom when it has no room to grow (src/game/city.ts:757).",
        "City.buyLot lets the player buy a town lot out, and the lot is held empty (src/game/city.ts:1260).",
    ],
    files=["src/game/city.ts"],
    dynamics=[
        Fn(name="City", at="src/game/city.ts:177", does="the town engine: roads, lots, traffic, growth, businesses, taxis, disasters", sig="class City"),
        Fn(name="netOps", at="src/game/city.ts:692", does="applies road ops; returns the lots and parcels added and removed", sig="netOps(ops: NetOp[])"),
        Fn(name="step", at="src/game/city.ts:757", does="steps the city one tick and returns its events, grow legs, milestones and the ledger", sig="step(n: number)"),
        Fn(name="setPlaces", at="src/game/city.ts:401", does="sets the iconic places' rectangles", sig="setPlaces(rects)"),
        Fn(name="growTowns", at="src/game/city.ts:594", does="grows the towns at a rate", sig="growTowns(rate)"),
        Fn(name="buyLot", at="src/game/city.ts:1260", does="the player's bulldozer buys a town lot out", sig="buyLot(key: string)"),
        Fn(name="liftIncident", at="src/game/city.ts:915", does="lifts an incident and its blocks", sig="liftIncident(id: number)"),
        Fn(name="repairDisaster", at="src/game/city.ts:951", does="repairs a closed road of a disaster", sig="repairDisaster(id, key)"),
    ],
    inputs=["road ops (NetOp)", "the step count", "player actions (buy out, repair, incidents)"],
    outputs=["events", "grow legs", "the lots added and removed", "milestones and the ledger"],
    tests=["tests/city.test.ts", "tests/town.test.ts", "tests/disasters-wiring.test.ts", "tests/business-city.test.ts", "tests/golf-towngrowth.test.ts"],
    below=["town.growth.town", "town.growth.plan", "town.traffic.sim", "town.farms.map", "town.lots.cut"],
    above=["core", "business", "ui"],
    dual="repairDisaster (src/game/city.ts:951) and liftIncident (src/game/city.ts:915) undo closures; buyLot (src/game/city.ts:1260) undoes a town lot's build",
    seams=["the worker shell that runs the City (src/game/sim/sim.worker.ts, core)", "the town's events the UI shows (ui)"],
    rules=["roads rebuild instantly, with no manual ground rebuild", "town jams are the player's job (never auto-fix congestion)"],
    impl="describe",
)
