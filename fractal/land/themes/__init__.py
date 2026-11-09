"""land.themes: the desert version of the map: its surfaces, its planting, its props and its litter"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.themes", rung=2, title="Desert theme",
    purpose="the desert version of the map: its surfaces, its planting, its props and its litter",
    requires=["desertSurfaces maps a surfaces file to the desert look (desert-theme.ts), and the theme is a stored toggle (DESERT_KEY); the normal look is kept."],
)
