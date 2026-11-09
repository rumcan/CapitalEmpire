"""core.save.engine: the engine's save and load (engine.ts scheduleSave, save, load), described: it builds and reads the SaveV5 record."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.save.engine", rung=3, title="Engine save and load",
    purpose="Turn the Game's state into the SaveV5 record on a timer, and load a record back into the Game.",
    requires=[
        "scheduleSave debounces to one save 800 ms after the last change (engine.ts line 8167); a benchmark never saves.",
        "load (line 8212) takes a SaveV5 and rebuilds the town, the course, the range and the traffic from it.",
    ],
    owns=["the save timer", "the Game's save fields as SaveV5"],
    files=['src/game/golf/mode.ts'],
    dynamics=[
        Fn(name="scheduleSave", at="src/game/engine.ts:8167", does="debounces a save 800 ms after the last change", sig="scheduleSave()"),
        Fn(name="save", at="src/game/engine.ts:8171", does="builds the SaveV5 record and writes it", sig="save()"),
        Fn(name="load", at="src/game/engine.ts:8212", does="rebuilds the Game from a SaveV5 record", sig="load(d)"),
    ],
    inputs=["the Game's state"],
    outputs=["a SaveV5 record to core.save.io", "the Game rebuilt from one"],
    tests=["tests/save.test.ts", "tests/golf-day-resume.test.ts", "tests/network.test.ts", "tests/road-owner.test.ts"],
    below=["core.save.io"], above=["core.engine.orchestra"],
    dual="load of the backup taken before the change (backupTownSlot)",
    impl="describe",
)
