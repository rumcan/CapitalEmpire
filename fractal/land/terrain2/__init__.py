"""land.terrain2: the second, hillier generator (ext/terrain2): tests and its preview only"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.terrain2", rung=2, title="Terrain v2 (not live)",
    purpose="the second, hillier generator (ext/terrain2): tests and its preview only",
    requires=["ext/terrain2 is not imported by the live game (engine.ts uses terrain/generateTerrain); only its tests and its preview use generateTerrain2."],
)
