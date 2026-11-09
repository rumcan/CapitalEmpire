"""core.engine.newgame: the new-game paths (engine.ts newGame, newRangeGame, newGolfGame, newOsmGame), described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.engine.newgame", rung=3, title="New games",
    purpose="Start a new game in its start: the town, the range, a golf course from the presets, or a real course from OpenStreetMap.",
    requires=[
        "newGame, newRangeGame, newGolfGame and newOsmGame each set the start's state and return true when it started (engine.ts lines 3260, 3275, 3313, 3355).",
        "A new game starts with the boot's start money (budget.ts startMoney: 80000 for a town start).",
    ],
    owns=["the start's state (golf.start, the range scene, the osm spec)"],
    files=['src/game/golf/start.ts'],
    dynamics=[
        Fn(name="newGame", at="src/game/engine.ts:3260", does="starts a town game on the generated valley", sig="newGame()"),
        Fn(name="newRangeGame", at="src/game/engine.ts:3275", does="starts a range game", sig="newRangeGame()"),
        Fn(name="newGolfGame", at="src/game/engine.ts:3313", does="starts a golf game from a preset", sig="newGolfGame()"),
        Fn(name="newOsmGame", at="src/game/engine.ts:3355", does="starts a real course from an OSM spec", sig="newOsmGame(spec)"),
        Fn(name="genTerrain", at="src/game/engine.ts:3246", does="generates the terrain for a seed", sig="genTerrain(seed, model)"),
    ],
    inputs=["a start choice", "a seed or an OSM course spec"],
    outputs=["the started game (true) or false"],
    tests=["tests/golf-newgame-month.test.ts", "tests/golf-start.test.ts", "tests/golf-rangestart.test.ts", "tests/desert-start.test.ts"],
    below=["land.terrain"], above=["core.engine.orchestra"],
    dual="MISSING: a new game replaces the open one (the save slot is overwritten; only the backups from backupTownSlot remain)",
    impl="describe",
)
