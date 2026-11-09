"""land.river.course: the river course for a seed (the natural river of terrain model 2). Port still to write: see port."""
from fractal.holon import Fn, Holon


def river_course(seed: int, model: int = 2, knobs=None):
    """stub: the port of the river (265 lines of TS, plus the generator it sits in) is still to write"""
    raise NotImplementedError("land.river.course: port still to write (see port)")


HOLON = Holon(
    id="land.river.course", rung=3, title="River course for a seed",
    purpose="Give the map river and creeks as centreline points with their widths, from the seed alone.",
    requires=[
        "The river of terrain model 2 is natural: its points carry a width w and a signed point bar (types.ts WaterPoint); model 1 has no bars.",
        "meanderLine lays the centreline between two edge points; shapeRiver gives it its banks; a creek is a shorter waterway with kind creek.",
        "The waterways come back on Terrain.waters, from generateTerrain(seed, model), and are the same for the same seed.",
    ],
    owns=["NAT (river.ts:47, the natural river tuning)", "BAR_SHARE and W_MAX (river.ts:23)"],
    files=["src/game/terrain/river.ts"],
    dynamics=[
        Fn(name="generateTerrain", at="src/game/terrain/generate.ts:558", does="builds the whole valley; the river and creeks are its waters", sig="generateTerrain(seed: number, model = 1): Terrain"),
        Fn(name="meanderLine", at="src/game/terrain/river.ts:81", does="the wandering centreline between two points", sig="meanderLine(wander, a, b, map, spec, look): P[]"),
        Fn(name="shapeRiver", at="src/game/terrain/river.ts:135", does="the river points with width, bars and banks along the line", sig="shapeRiver(line, nz): WaterPoint[]"),
        Fn(name="shapeCreek", at="src/game/terrain/river.ts:238", does="a creek points along its channel", sig="shapeCreek(pts, nz, row): WaterPoint[]"),
    ],
    inputs=["seed: int", "model: 1 or 2"], outputs=["waters: kind, pts with x, y, w, bar"],
    tests=["tests/river-natural.test.ts", "tests/terrain.test.ts"],
    below=["land.terrain.fields"], above=["land.river.cut", "land.river.trees", "land.water.map", "land.relief.paint"],
    dual="MISSING: a river is fixed for the game; only a new game (another seed) changes it",
    seams=["Waterway list is read by river-cut, river-trees, map-water, water-look and the bake"],
    rules=["town jams are the player's job", "performance is a hard gate"],
    impl="native", fn=river_course, params={"seed": "int, the map seed", "model": "int, 2 for the natural river; 1 for the old straight ribbon"},
    steer={"model": 2, "bar_share": 0.27, "w_max": 52},
    port="todo: input seed (int), model (int); output waters list of {kind, pts: [{x, y, w, bar}]}. Port river.ts (265 lines: meanderLine :81, shapeRiver :135, shapeCreek :238, NAT tuning :47) with the noise in terrain/noise.ts and the call order in generateTerrain (terrain/generate.ts:558).",
)
