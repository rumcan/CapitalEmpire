"""land.relief: the height field as a picture (heightmap, hillshade), slope bands, and the terrain paint helpers"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.relief", rung=2, title="Relief: height as pictures and paint",
    purpose="the height field as a picture (heightmap, hillshade), slope bands, and the terrain paint helpers",
    requires=["The hillshade is lit from the upper right, shadows at 145 degrees (SUN_LIGHT, course-height/index.ts).", "The relief paint helpers (terrain-paint.ts) run in Node and in workers: no DOM types."],
)
