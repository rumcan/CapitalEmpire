"""core.flags.features: the feature switches (features.ts), described; the switch is a steer knob so a model can turn it on in its own copy."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.flags.features", rung=3, title="Feature switches",
    purpose="Switch a feature off for now: greenkeeping (grass care) is off, so its UI and its system are both gone.",
    requires=[
        "GREENKEEPING is false: no Greenkeeping on the rail or in the Course flyout, and no grass-care system (features.ts line 6).",
        "Flipping the switch back to true restores the UI and the system as they were.",
    ],
    owns=["GREENKEEPING"],
    files=["src/game/features.ts"],
    dynamics=[Fn(name="GREENKEEPING", at="src/game/features.ts:6", does="the greenkeeping switch: off hides the UI and disables the grass-care system", sig="GREENKEEPING = false")],
    inputs=["none (a constant)"],
    outputs=["the switch read by the rail, the course flyout and the grass-care system"],
    tests=["tests/golf-greenkeeping.test.ts", "tests/ui-flyouts.test.ts", "tests/ui-rail.test.ts"],
    below=[], above=["core.flags"],
    dual="GREENKEEPING = true (the file's own comment says so)",
    steer={"GREENKEEPING": False},
    impl="describe",
)
