"""core.dev.fixtures: the dev fixtures: the estate and dev-save fixtures, the road fuzz, the ship exam and the car paint audit, described (dev only)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.dev.fixtures", rung=3, title="Dev fixtures and audits",
    purpose="Load fixed scenes (an estate, a dev save), fuzz the roads, examine a shipped set and audit the car paints, for the gates and the owner's checks.",
    requires=["The fixtures are fixed data: the same scene loads the same way each time (fixtures.ts, estate-fixture.ts)."],
    owns=["the fixture scenes and the dev save's merge rules"],
    files=["src/game/dev/fixtures.ts", "src/game/dev/estate-fixture.ts", "src/game/dev/dev-save.ts", "src/game/dev/roadfuzz.ts", "src/game/dev/ship-exam.ts", "src/game/dev/car-paint-audit.ts"],
    dynamics=[],
    inputs=["a fixture name"],
    outputs=["a loaded fixture scene", "the fuzz and exam reports"],
    tests=["tests/dev-save-merge.test.ts", "tests/golf-estate.test.ts", "tests/golf-estate-wiring.test.ts"],
    below=["core.save.io"], above=["core.dev"],
    dual="the dev save's merge is undone by reloading the saved slot",
    impl="describe",
)
