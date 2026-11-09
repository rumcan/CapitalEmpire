"""core.tick.sim: the traffic sim's client, protocol and worker (sim/client.ts, sim/protocol.ts, sim/sim.worker.ts), described: the sim runs off the main thread."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.tick.sim", rung=3, title="Sim client, protocol and worker",
    purpose="Run the traffic sim in a worker and hand its car positions to the frame each tick, over one typed message protocol.",
    requires=[
        "SimClient talks to sim.worker.ts only through the message types in protocol.ts; the frame never waits on the worker.",
        "The worker steps the sim at the fixed DT; the frame reads the latest positions (sim/client.ts SimClient).",
    ],
    owns=["the worker message protocol (protocol.ts)", "the client's latest positions buffer"],
    files=["src/game/sim/client.ts", "src/game/sim/protocol.ts", "src/game/sim/sim.worker.ts"],
    dynamics=[Fn(name="SimClient", at="src/game/sim/client.ts:57", does="the main-thread handle of the sim worker: sends steps, receives positions", sig="class SimClient")],
    inputs=["the frame's clock and the network edits", "the worker's position messages"],
    outputs=["car positions and the info at 10 Hz for the frame (engine.ts traffic.update)"],
    tests=["tests/sim.test.ts", "tests/sim-townclock.test.ts", "tests/incidents-sim.test.ts"],
    below=["town.traffic"], above=["core.tick.frame"],
    dual=None,
    rules=["performance is a hard gate"],
    impl="describe",
)
