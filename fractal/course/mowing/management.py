"""course.mowing.management: the grass upkeep: mow, water, feed, aerate, seed and sod, the wear and the recovery of each grass cell."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.mowing.management", rung=3, title="Grass management",
    purpose="Keep the course's grass in condition: each action (mow, water, fertilise, aerate, seed, sod, repair) costs money and changes a cell's condition, and wear and weather move it back.",
    requires=[
        "A mow costs 2 and a water costs 1 (GRASS_COST); each action names its grass cell by a scope.",
        "The grass conditions are neglected, stressed, recovering, maintained and pristine (GrassCondition).",
        "A grass surface is one of the golf surfaces (GRASS_SURFACES), and the decals are mowing stripes and patterns, crowd and divots (GRASS_DECALS).",
    ],
    files=[
        "src/game/ext/grass-management/index.ts",
        "src/game/ext/grass-management/management.ts",
        "src/game/ext/grass-management/catalog.ts",
    ],
    dynamics=[
        Fn(name="GrassManagement", at="src/game/ext/grass-management/management.ts:47", does="the grass upkeep class: its cells, the actions and the weather", sig="class GrassManagement"),
        Fn(name="grassContains", at="src/game/ext/grass-management/management.ts:23", does="whether a point lies in a grass cell's polygon", sig="grassContains(pts, x, y): boolean"),
        Fn(name="grassSurface", at="src/game/ext/grass-management/catalog.ts:18", does="the grass surface a texture belongs to", sig="grassSurface(tex, lawn?, presetSurface?): GrassSurface | null"),
    ],
    inputs=["a grass action and its scope", "the weather"], outputs=["the cell conditions", "the cost"],
    tests=["tests/ext-grass-management.test.ts", "tests/golf-greenkeeping.test.ts", "tests/golf-range-look.test.ts"],
    below=["course.surfaces.grasses"], above=["course.mowing", "play", "business"],
    dual="MISSING: management.ts has no undo or refund for an action (grep finds none); a mow, water or sod is spent and stays until a saved game is loaded",
    impl="describe", steer={"mow_cost": 2, "water_cost": 1, "fertilise_cost": 3, "aerate_cost": 4},
)
