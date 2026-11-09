"""render.sprites: sprites organised for drawing: per-tile instance lists in painter's order (T410). Children: the packing, the tile order."""
from fractal.holon import Holon

HOLON = Holon(
    id="render.sprites", rung=2, title="Sprite packing",
    purpose="Turn each visible prop into instance data for its draw tiles, in painter's order, so a frame is one instanced draw.",
    requires=["Every prop is listed in each draw tile (SPR_W x SPR_H world px) its picture touches; the shader clips to the tile (sprites.ts header)."],
    below=["render.atlas", "render.shadows", "render.iso"], above=["render.gl", "core.tick.frame"],
    rules=["lit sprites are never mirrored", "performance is a hard gate"],
)
