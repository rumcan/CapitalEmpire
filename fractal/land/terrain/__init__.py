"""land.terrain: the generator: hills, patches, the river and creeks from one seed"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.terrain", rung=2, title="Seeded valley terrain",
    purpose="the generator: hills, patches, the river and creeks from one seed",
    requires=["generateTerrain(seed, model) returns a Terrain whose height has 128 by 128 samples and whose cls has 1024 by 1024 classes.", "A new game stores its terrain model (TERRAIN_MODEL = 2); a save without one is model 1."],
)
