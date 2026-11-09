"""render.painter: the 2D painter for the ground's paint and its bevelled edges (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="render.painter", rung=2, title="Ground painter",
    purpose="Paint the course and town ground's colours, walls and kerbs onto the baked tiles, from the owner's paint.",
    requires=["The ground is painted in two passes: fills first, then the kerb faces at FACE_CUTS 0.62 and 0.3 (kerb-face.ts)."],
    below=["art"], above=["land.bake", "core.engine.orchestra"],
    rules=["no flat colour washes", "no visible tiling"],
)
