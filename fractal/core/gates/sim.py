"""core.gates.sim: the sim gate (scripts/sim/gate.ts), described: the benchmark network run headless with a fixed car count."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.gates.sim", rung=3, title="Sim gate",
    purpose="Prove the traffic keeps moving on the benchmark network: active cars, arrivals and speed each hour, few towed or lost.",
    requires=[
        "Pass: after the first hour, active is at least 98% of the target every hour; arrivals above 0 every hour; mean speed above 1 m/s every hour (gate.ts header).",
        "Towed over arrived is under 1% and lost over arrived is under 2% over the run.",
    ],
    owns=["output/sim/gate.json (the summary, every hour)"],
    files=[],
    dynamics=[],
    inputs=["days (default 10) and cars (default 10000); the smoke run is 0.05 2000"],
    outputs=["output/sim/gate.json and the stdout summary; exit 1 on a failed gate"],
    tests=["npm run sim:gate -- 0.05 2000 (smoke)", "npm run sim:gate (full, on the worker)", "tests/sim.test.ts"],
    below=["core.bench.network", "town.traffic"], above=["core.gates"],
    dual=None,
    impl="describe",
)
