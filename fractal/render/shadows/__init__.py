"""render.shadows: the shadows of the sprites: the cast silhouettes, the contact shapes and the vector shadows (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="render.shadows", rung=2, title="Sprite shadows",
    purpose="Give every upright sprite its shadow on the ground, away from the upper-right sun: a cast silhouette, a contact shape and a vector.",
    requires=["Shadows fall at 145 degrees from the sun at the upper right (cast-shadow.ts CAST_DEFAULT angle 145)."],
    below=["art"], above=["render.gl", "render.sprites"],
    rules=["sun upper right, shadows 145 degrees", "no flat colour washes", "shadows never multiply"],
)
