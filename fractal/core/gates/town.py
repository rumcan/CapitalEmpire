"""core.gates.town: the town gates (scripts/sim/town-gate.ts and towns-gate.ts), described: the grown town's streets and its traffic."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.gates.town", rung=3, title="Town gates",
    purpose="Check the grown town headless: its streets, lots and traffic, for one town and for several.",
    requires=["Town jams are the player's job: the gate checks the grown town's flow, never auto-fixes congestion (CLAUDE.md, town-jams rule)."],
    owns=["output/sim/town-gate.json and towns-gate.json"],
    files=[],
    dynamics=[],
    inputs=["the seed towns (seedtowns.ts)"],
    outputs=["the town gate summaries"],
    tests=["npm run town:gate (on the worker)", "npm run towns:gate (on the worker)", "tests/town-grown.test.ts", "tests/roads-grown.test.ts"],
    below=["town.roads", "town.traffic"], above=["core.gates"],
    dual=None,
    impl="describe",
)
