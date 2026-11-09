"""land.water: the water on the map (the join with the ground, the motion, the look of the water)"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.water", rung=2, title="Water: map, motion and look",
    purpose="the water on the map (the join with the ground, the motion, the look of the water)",
    requires=["The water look is stored in the painted-surfaces file (GroundCache.setWaterLook) and clamped on load (clampWaterLook, clampWaterMotion)."],
)
