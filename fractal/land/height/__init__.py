"""land.height: the real ground height under a map-data course: elevation tiles, decoded, sampled and packed for a save"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.height", rung=2, title="Real ground height (downloaded courses)",
    purpose="the real ground height under a map-data course: elevation tiles, decoded, sampled and packed for a save",
    requires=["The downloaded height is saved as a packed grid (HeightPack) with its source and credit."],
)
