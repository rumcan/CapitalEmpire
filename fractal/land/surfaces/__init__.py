"""land.surfaces: which hand-painted family each surface wears, its tiles, its ground levels, its turn and its edges"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.surfaces", rung=2, title="Painted surfaces",
    purpose="which hand-painted family each surface wears, its tiles, its ground levels, its turn and its edges",
    requires=["Each surface of the game (golf, map, town, living ground, course walls) names one painted family and its look."],
)
