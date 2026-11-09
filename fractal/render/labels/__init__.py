"""render.labels: the world labels: collected each frame and placed in one pass so none overlap (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="render.labels", rung=2, title="World labels",
    purpose="Write the names and counts on the map (business names, car park counts, stand-in pills, town names) without overlaps.",
    requires=["World labels never overlap: one placement pass each frame, by priority, stable from frame to frame (label-place.ts header)."],
    below=["render.iso"], above=["core.tick.frame", "business", "town", "course"],
    rules=["no visible tiling"],
)
