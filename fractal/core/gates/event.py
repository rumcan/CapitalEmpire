"""core.gates.event: the event gate (scripts/sim/event-gate.ts), described: a tournament day run headless."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.gates.event", rung=3, title="Event gate",
    purpose="Run an event day headless and check its crowd, parking and seating.",
    requires=["The event gate fails when the day's crowd, parking or seating breaks its checks (event-gate.ts)."],
    owns=["the event gate's summary"],
    files=[],
    dynamics=[],
    inputs=["an event day and its config"],
    outputs=["the event summary"],
    tests=["npm run event:gate (on the worker)", "tests/event.test.ts", "tests/golf-eventtool.test.ts"],
    below=["business.events"], above=["core.gates"],
    dual=None,
    impl="describe",
)
