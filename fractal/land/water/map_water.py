"""land.water.map: the water on the map and where it joins the ground (map-water.ts): the join, the fades and the area joins."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.water.map", rung=3, title="Water on the map and its joins",
    purpose="Make the river, creeks and ponds meet the ground cleanly: a join where water runs into a built edge, fades at the bank, and area joins for ponds.",
    requires=[
        "waterRuns turns each waterway into runs of points, scaled by kind.",
        "JOIN_REACH 2 and JOIN_EDGE 1.5 set how far a join reaches into the water (map-water.ts constants).",
        "fadeBands returns the bands that fade the water edge; a band narrower than FADE_MIN_WIDTH is not drawn.",
    ],
    owns=["JOIN and FADE constants (map-water.ts lines 18 to 31)", "MapWater (the water index over a grid)"],
    files=["src/game/map-water.ts", "src/game/swamp.ts"],
    dynamics=[
        Fn(name="waterRuns", at="src/game/map-water.ts:37", does="the waterways as runs of points, scaled by kind", sig="waterRuns(waters, scale): WaterRun[]"),
        Fn(name="MapWater", at="src/game/map-water.ts:58", does="the water index over the grid (which cells are water)", sig="class MapWater"),
        Fn(name="joinCells", at="src/game/map-water.ts:150", does="the cells where water joins the ground", sig="joinCells(g, box, water): Join | null"),
        Fn(name="fadeBands", at="src/game/map-water.ts:242", does="the fade bands along the water edge", sig="fadeBands(water, box, keep?): FadeBand[]"),
        Fn(name="areaJoin", at="src/game/map-water.ts:265", does="the join of a pond or lake ring with the water", sig="areaJoin(ring, water): AreaJoin | null"),
    ],
    inputs=["waterways, a grid box, a ring of area points"], outputs=["join cells, fade bands and joined edges"],
    tests=["tests/map-water.test.ts", "tests/map-water-town.test.ts", "tests/river-natural.test.ts"],
    below=["land.river.course"], above=["land.bake.worker", "land.water.look"],
    dual="MISSING: the join is recomputed from the waterways; water is changed by the terrain, not undone here",
    seams=["the waterways (Terrain.waters) and the ground grid from the bake"],
    rules=["no flat colour washes", "roads rebuild instantly, no manual ground rebuild"],
    impl="describe",
)
