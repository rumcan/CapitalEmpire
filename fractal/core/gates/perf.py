"""core.gates.perf: the performance budget run (scripts/perf/bench.mjs, npm run bench and worker:bench), described: the hard gate on every rendering change."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.gates.perf", rung=3, title="Performance budget",
    purpose="Measure the frame on the bench against the budgets in GAME-PLAN section 2.3 before and after a change, and refuse a change that goes over.",
    requires=[
        "The budgets are in docs/GAME-PLAN.md section 2.3: a frame ceiling per addition, and ground plus tiles at most 192 MB.",
        "Run main and the branch the same way (npm run worker:bench on the worker); a change over budget is not merged.",
    ],
    owns=["the bench's result files"],
    files=[],
    dynamics=[],
    inputs=["a build and the scene and size (--size 1)"],
    outputs=["the frame times and the memory per zoom stage"],
    tests=["npm run bench", "npm run worker:bench (the worker PC)", "tests/budget.test.ts"],
    below=["core.bench.scenes"], above=["core.gates"],
    dual=None,
    rules=["performance is a hard gate (ground plus tiles at most 192 MB)"],
    impl="describe",
)
