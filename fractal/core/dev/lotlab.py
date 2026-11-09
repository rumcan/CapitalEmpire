"""core.dev.lotlab: the lot lab: a light boot to build and review one lot's house and palette (src/game/dev/lot-lab*.ts and lab-boot.ts), described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.dev.lotlab", rung=3, title="Lot lab",
    purpose="Open one lot at a time in a light boot, pick its palette and plan, and review it.",
    requires=["labBoot starts the engine with the lab's light boot options, not the game's (lab-boot.ts; boot.ts header)."],
    owns=["the lab's selected lot and palette"],
    files=["src/game/dev/lot-lab.ts", "src/game/dev/lot-lab-palette.ts", "src/game/dev/lot-lab-plan.ts", "src/game/dev/lot-lab-ui.ts", "src/game/dev/lab-boot.ts"],
    dynamics=[
        Fn(name="labBoot", at="src/game/dev/lab-boot.ts:41", does="the light boot options for the lot lab", sig="labBoot(side)"),
    ],
    inputs=["a lot key and a palette choice"],
    outputs=["the lab's view of one lot"],
    tests=["tests/lab-boot.test.ts", "tests/lot-lab-palette.test.ts", "tests/lot-lab-select.test.ts"],
    below=["core.boot.options"], above=["core.dev"],
    dual="the lab's palette reset (the lot returns to its saved look)",
    impl="describe",
)
