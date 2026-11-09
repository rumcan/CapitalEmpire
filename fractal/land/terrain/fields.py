"""land.terrain.fields: the pure helpers the generator uses: noise, drainage (priority flood, flow directions, accumulation) and the Terrain accessors."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.terrain.fields", rung=3, title="Noise, drainage and terrain accessors",
    purpose="Give the generator its noise, its water flow over the height grid and the class and height lookups the rest of the game uses.",
    requires=[
        "makeNoise(seed) returns a 2D noise function about [-1, 1]; fbm sums its octaves.",
        "priorityFlood, flowDirs and flowAccum work on the height grid of HS by HS samples (8-neighbour offsets, flow.ts).",
        "heightAt and classAt sample the Terrain's grids at a tile position.",
    ],
    owns=["TC class ids (GROUND 0, PATCH 1, HILL 2, WATER 3, CREEK 4, BANK 5)", "HSTEP (8 tiles per height sample) and HS (MAP / HSTEP)"],
    files=["src/game/terrain/noise.ts", "src/game/terrain/flow.ts", "src/game/terrain/types.ts", "src/game/terrain/index.ts"],
    dynamics=[
        Fn(name="makeNoise", at="src/game/terrain/noise.ts:11", does="a seeded 2D noise function", sig="makeNoise(seed: number): Noise"),
        Fn(name="fbm", at="src/game/terrain/noise.ts:36", does="fractal noise: octaves of the noise summed", sig="fbm(n, x, y, oct, lac = 2, gain = 0.5): number"),
        Fn(name="priorityFlood", at="src/game/terrain/flow.ts:5", does="fills the sinks of the height grid so water can drain off it", sig="priorityFlood(h: Float32Array, n: number): Float32Array"),
        Fn(name="flowAccum", at="src/game/terrain/flow.ts:61", does="counts the upstream cells that drain through each cell", sig="flowAccum(dir: Int32Array, n: number, f: Float32Array): Float32Array"),
        Fn(name="heightAt", at="src/game/terrain/types.ts:49", does="the height at a tile position (sampled from the height grid)", sig="heightAt(t: Terrain, x: number, y: number): number"),
        Fn(name="classAt", at="src/game/terrain/types.ts:52", does="the terrain class at a tile", sig="classAt(t: Terrain, x: number, y: number): number"),
    ],
    inputs=["seed or height grid"], outputs=["noise values, flow directions, accumulations, heights and classes"],
    tests=["tests/terrain.test.ts (through generateTerrain; no test imports flow.ts directly)", "tests/river-natural.test.ts (noise)"],
    below=[], above=["land.terrain.generate", "land.river.course", "land.relief.paint"],
    dual="MISSING: no undo needed: these are pure functions; the map changes only by a new game",
    seams=["Terrain.height and Terrain.cls are read by every system above land"],
    rules=["performance is a hard gate"],
    impl="describe",
)
