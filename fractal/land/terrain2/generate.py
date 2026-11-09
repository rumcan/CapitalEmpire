"""land.terrain2.generate: the second, hillier generator (ext/terrain2), not on the live path. Port still to write: see port."""
from fractal.holon import Fn, Holon


def terrain2_generate(seed: int, knobs=None):
    """stub: the port of generateTerrain2 (757 lines of TS) is still to write"""
    raise NotImplementedError("land.terrain2.generate: port still to write (see port)")


HOLON = Holon(
    id="land.terrain2.generate", rung=3, title="Terrain v2 generator (not live)",
    purpose="An organic hill country for the 4 by 4 km map, with its guarantee check, kept as an experiment beside the live generator.",
    requires=[
        "generateTerrain2(seed) returns a Terrain from the seed alone (pure TypeScript, no DOM).",
        "checkGuarantees2 reports the guarantee record for the v2 map.",
        "No live code calls generateTerrain2: engine.ts imports generateTerrain from src/game/terrain only.",
    ],
    owns=["T2 tuning constants (ext/terrain2/generate.ts:15)"],
    files=["src/game/ext/terrain2/generate.ts", "src/game/ext/terrain2/index.ts"],
    dynamics=[
        Fn(name="generateTerrain2", at="src/game/ext/terrain2/generate.ts:748", does="builds the v2 valley from a seed", sig="generateTerrain2(seed: number): Terrain"),
        Fn(name="checkGuarantees2", at="src/game/ext/terrain2/generate.ts:670", does="checks the v2 map guarantees", sig="checkGuarantees2(t: Terrain): Guarantees2"),
    ],
    inputs=["seed: number"], outputs=["Terrain (height grid, class grid, waters)"],
    tests=["tests/ext-terrain2.test.ts"],
    below=["land.terrain.fields"], above=[],
    dual="MISSING: no live path to undo; it changes nothing in the game until something imports it",
    seams=["Terrain type shared with land.terrain"],
    rules=["performance is a hard gate"],
    impl="native", fn=terrain2_generate, params={"seed": "int, the map seed"},
    steer={"grid_side": 128, "map_tiles": 1024},
    port="todo: input seed (int); output Terrain JSON as land.terrain.generate. Port generateTerrain2 at src/game/ext/terrain2/generate.ts:748 (757 lines, T2 constants at :15) and its guarantees at :670.",
)
