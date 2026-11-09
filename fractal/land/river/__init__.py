"""land.river: the river course and its banks, the creek channels, the cut where the river meets built ground, and the tree belt along the water"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.river", rung=2, title="River, creeks and tree belts",
    purpose="the river course and its banks, the creek channels, the cut where the river meets built ground, and the tree belt along the water",
    requires=["A terrain model 2 river meanders with point bars (T360); model 1 keeps the old straight ribbon."],
)
