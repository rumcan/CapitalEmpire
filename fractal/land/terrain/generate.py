"""land.terrain.generate: the seeded valley terrain (the live generator, generateTerrain). Port still to write: see port."""
from fractal.holon import Fn, Holon


def terrain_generate(seed: int, model: int = 1, knobs=None):
    """stub: the port of generateTerrain (566 lines of TS) is still to write"""
    raise NotImplementedError("land.terrain.generate: port still to write (see port)")


HOLON = Holon(
    id="land.terrain.generate", rung=3, title="Seeded valley terrain",
    purpose="Turn a seed into the map: hills, patches, a river and creeks, with the buildable ground and the water on it.",
    requires=[
        "generateTerrain(seed, model) returns the same Terrain for the same seed and model.",
        "generateTerrain defaults to model 1 (the straight river of a save from before T360); engine.ts asks for TERRAIN_MODEL (2) for a new game.",
        "The result carries the seed, the attempt that produced it, height (128 by 128 samples), cls (1024 by 1024 tile classes) and the waterways.",
        "checkGuarantees reports whether the buildable ground joins the map two sides; a retry makes a new attempt when it does not.",
    ],
    owns=["Terrain (seed, attempt, height, cls, waters, mountainEdges, chokepoints) in src/game/terrain/types.ts"],
    files=["src/game/terrain/generate.ts"],
    dynamics=[
        Fn(name="generateTerrain", at="src/game/terrain/generate.ts:558", does="builds the seeded valley and returns its Terrain; the river and creeks come from it (waters)", sig="generateTerrain(seed: number, model = 1): Terrain"),
        Fn(name="checkGuarantees", at="src/game/terrain/generate.ts:133", does="checks the map keeps a buildable route between its two sides; reports the reasons", sig="checkGuarantees(t: Terrain): GuaranteeReport"),
        Fn(name="setValleys", at="src/game/terrain/generate.ts:15", does="switches the valley shaping on or off (a development switch)", sig="setValleys(on: boolean): void"),
    ],
    inputs=["seed: number", "model: 1 or 2 (terrainModelOf of a save)"],
    outputs=["Terrain (height grid, class grid, waters)"],
    tests=["tests/terrain.test.ts", "tests/river-natural.test.ts", "tests/golf-range-seeds.test.ts"],
    below=["land.terrain.fields", "land.river.course"],
    above=["core", "town", "course"],
    dual="MISSING: a generated terrain cannot be regenerated in place; only a new game with another seed changes the map (a save keeps its seed).",
    seams=["engine.ts genTerrain calls generateTerrain(seed, TERRAIN_MODEL)", "save.ts stores the seed and terrainModel"],
    rules=["town jams are the player's job", "performance is a hard gate"],
    impl="native", fn=terrain_generate,
    params={"seed": "int, the map seed", "model": "int, 1 or 2 (the terrain model; 2 for a new game)"},
    steer={"grid_side": 128, "hstep": 8, "map_tiles": 1024, "model": 2},
    port="todo: inputs seed (int) and model (int, 1 or 2); output Terrain JSON: height 128 by 128 floats, cls 1024 by 1024 bytes, waters list. Port generateTerrain at src/game/terrain/generate.ts:558 (566 lines) with its noise (terrain/noise.ts makeNoise), drainage (terrain/flow.ts) and river (terrain/river.ts shapeRiver, meanderLine).",
)
