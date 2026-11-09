"""core.gates.fix: the fix gate (scripts/sim/fix-gate.ts), described: the fixes the owner asked for, each checked headless."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.gates.fix", rung=3, title="Fix gate",
    purpose="Check the owner's recorded fixes still hold, headless, so a later change does not bring an old fault back.",
    requires=["Each recorded fix has a headless check that fails when its fault is back (fix-gate.ts)."],
    owns=["the list of checked fixes"],
    files=[],
    dynamics=[],
    inputs=["the fix list"],
    outputs=["a pass or fail per fix"],
    tests=["npm run fix:gate (on the worker)", "tests/golf-money-fixes.test.ts", "tests/golf-progression-fixes.test.ts"],
    below=["core.bench.network"], above=["core.gates"],
    dual=None,
    impl="describe",
)
