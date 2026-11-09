"""core.gates.range: the range gate and its fixture (scripts/sim/range-gate.ts, range-fixture.ts), described: the driving range run headless."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.gates.range", rung=3, title="Range gate",
    purpose="Run the driving range's ball loop headless and check its balls, its bays and its money.",
    requires=["The range gate fails when the ball loop or the bay count leaves its checked range (range-gate.ts)."],
    owns=["the range fixture scene"],
    files=[],
    dynamics=[],
    inputs=["a range fixture"],
    outputs=["the range summary"],
    tests=["npm run range:gate (on the worker)", "npm run range:fixture", "tests/golf-range.test.ts", "tests/golf-range-balls.test.ts"],
    below=["play.range"], above=["core.gates"],
    dual=None,
    impl="describe",
)
