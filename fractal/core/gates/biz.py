"""core.gates.biz: the business gate (scripts/sim/biz-gate.ts), described: the business's money and visits run headless."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.gates.biz", rung=3, title="Business gate",
    purpose="Run the business headless and check its money and its visits.",
    requires=["The business gate fails when the money or the visits leave their checked range (biz-gate.ts)."],
    owns=["the business gate's summary"],
    files=[],
    dynamics=[],
    inputs=["a business run"],
    outputs=["the money and visit summary"],
    tests=["npm run biz:gate (on the worker)", "tests/business-visits.test.ts", "tests/business-catalogue.test.ts"],
    below=["business.money"], above=["core.gates"],
    dual=None,
    impl="describe",
)
