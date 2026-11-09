"""land.water.look: the water look (water-look.ts): depth, the shallow edge, the reflections and glints, the palettes for ponds and rivers."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.water.look", rung=3, title="Water look",
    purpose="Give the water its colour and depth: a deep palette, a lit shallow edge, reflections of the trees and buildings, and glints in the sun.",
    requires=[
        "DEFAULT_WATER_LOOK is depth 1, reach 7, riverDepth 0.6, edge 1, reflect 1; each range is in WATER_RANGES.",
        "clampWaterLook clamps a saved look to those ranges; waterLookOf reads it from the painted-surfaces file.",
        "WaterField builds the per-cell distance field the edge, shade and reflection images are made from.",
    ],
    owns=["WaterLook (water-look.ts:28)", "POND_PAL and RIVER_PAL (the palettes)", "EDGE, REFLECT and GLINT (the tuning)"],
    files=["src/game/water-look.ts"],
    dynamics=[
        Fn(name="clampWaterLook", at="src/game/water-look.ts:51", does="clamps a saved water look to its ranges", sig="clampWaterLook(f: unknown): WaterLook"),
        Fn(name="waterLookOf", at="src/game/water-look.ts:60", does="reads the water look from the painted-surfaces file", sig="waterLookOf(file): WaterLook"),
        Fn(name="WaterField", at="src/game/water-look.ts:160", does="the distance field of the water cells, the base of the look images", sig="class WaterField"),
        Fn(name="waterImages", at="src/game/water-look.ts:384", does="the edge, shade and tint images for a mask and a look", sig="waterImages(f, mask, l)"),
    ],
    inputs=["the painted-surfaces file, a water field and a mask"], outputs=["edge, shade and tint images, and the glint image"],
    tests=["tests/water-look.test.ts", "tests/painted-tiles.test.ts"],
    below=["land.water.map"], above=["land.bake.worker", "render"],
    dual="setWaterLook on the ground cache writes the look back to the painted-surfaces file (GroundCache.setWaterLook)",
    seams=["the look lives in the painted-surfaces file (land.surfaces.assign)"],
    rules=["no flat colour washes", "highlights are textured", "performance is a hard gate"],
    impl="describe",
)
