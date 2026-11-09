"""core.gates: the headless gates and the benchmark: the scripts that check the sim, the town, the events, the business, the range and the frame budget (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.gates", rung=2, title="Gates and budgets",
    purpose="Check the game without a browser: the sim, the town, the fixes, the events, the business and the range, and the frame budget on the bench.",
    requires=["Each gate exits 1 when it fails (scripts/sim/gate.ts header); the gates run through npm scripts, and the long ones on the worker."],
    below=["core.bench", "town", "business", "play"], above=["core"],
    rules=["performance is a hard gate", "tests never block a merge (the nightly runs the suite)"],
)
