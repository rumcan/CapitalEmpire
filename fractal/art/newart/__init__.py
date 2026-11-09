"""art.newart: the new-art switch: a building drawn from its new four views or its family's stand-in, and the size each picture is drawn at (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="art.newart", rung=2, title="New-art switch and sizes",
    purpose="Swap old building pictures for the new art, draw a stand-in where no new view exists yet, and cap each picture at its own pixels.",
    requires=[
        "By default no building is drawn with its old picture: a building without its four new views is drawn as its family's stand-in on the same footprint (newart.ts header).",
        "No sprite is drawn above the pixels its atlas rect holds at the closest zoom (sizes.ts header, PIXEL_SLACK 1.02).",
    ],
    below=["art.library", "art.eight", "art.facing"], above=["core.engine.orchestra", "render.sprites.pack"],
    rules=["new art used everywhere", "the old look stays as an option (?oldart)", "straight views turned 8 degrees"],
)
