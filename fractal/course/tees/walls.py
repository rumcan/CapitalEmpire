"""course.tees.walls: the walls round a tee, bunker and rock edge: the earth wall's shade, the course walls' layers and stairs, and the spill of fairway over a wall."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.tees.walls", rung=3, title="Tee and course walls",
    purpose="Stand the earth walls round the bunkers and tees: the wall's shade from the sun, its layers, its stairs up a tee, and the grass that spills over the top.",
    requires=[
        "Walls are drawn at 80 pixels per metre (WALL_PX_PER_M).",
        "Only the fairway spills over a wall (SPILL_SURFACES).",
        "A tee wall's strength is 0.6 and its exposure 1.3 (TEE_WALL_STRENGTH, TEE_WALL_EXPOSURE).",
    ],
    files=[
        "src/game/tee-wall.ts",
        "src/game/ext/course-walls/index.ts",
        "src/game/ext/course-walls/spill.ts",
    ],
    dynamics=[
        Fn(name="bunkerWallShade", at="src/game/tee-wall.ts:31", does="the shade of a bunker wall for a light value", sig="bunkerWallShade(light, strength?): number"),
        Fn(name="teeWallShade", at="src/game/tee-wall.ts:38", does="the shade of a tee wall between two heights", sig="teeWallShade(b, lo, hi, strength?): number"),
        Fn(name="LayerStack", at="src/game/ext/course-walls/index.ts:222", does="the stack of surface layers a wall is built from", sig="class LayerStack"),
        Fn(name="chunkWalls", at="src/game/ext/course-walls/index.ts:334", does="the walls of one chunk of the course", sig="chunkWalls(g, layers, ...)"),
        Fn(name="teeStairs", at="src/game/ext/course-walls/index.ts:625", does="the stairs a tee's wall rises by", sig="teeStairs(g, box, paths?, ...)"),
        Fn(name="spillRuns", at="src/game/ext/course-walls/spill.ts:29", does="the runs where the fairway spills over a wall edge", sig="spillRuns(g, st, code, edges, ...)"),
    ],
    inputs=["the course grid", "the surface heights", "the tee and bunker edges"], outputs=["wall pictures", "stairs", "spill runs"],
    tests=["tests/ext-course-walls.test.ts", "tests/ext-course-walls-junction.test.ts", "tests/tee-look.test.ts", "tests/ext-bunker-geometry.test.ts"],
    below=["course.design.grid", "course.terrain.height"], above=["course.tees"],
    dual="a wall is rebuilt from the grid when a surface is removed (no state of its own to undo)",
    impl="describe", steer={"wall_px_per_m": 80, "wall_drop_div": 64, "wall_shadow": 0.9, "shadow_hairline": 0.15, "tee_wall_strength": 0.6, "tee_wall_exposure": 1.3},
)
