"""render.tone: the look of the picture: exposure per look, and the colour grade of the whole frame (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="render.tone", rung=2, title="Exposure and grade",
    purpose="Make the picture lighter or darker per look (exposure), and grade the whole frame's colour and edges (the grade).",
    requires=["Exposure stays between 0.5 and 2 (exposure.ts EXPOSURE_MIN, EXPOSURE_MAX)."],
    below=["art"], above=["core.tick.frame", "render.gl.frame"],
    rules=["no flat colour washes", "no visible tiling"],
)
