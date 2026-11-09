"""render.iso: the isometric projection, the zoom tiers, the camera and picking (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="render.iso", rung=2, title="Isometric view and camera",
    purpose="Map world tiles to the screen and back, move and zoom the camera, and say which tile is under the pointer.",
    requires=["The zoom stays between ZOOM_MIN 0.0125 and ZOOM_MAX 0.3 (iso.ts clampZoom)."],
    below=[], above=["core.engine.orchestra", "render.gl.frame", "render.labels"],
    rules=["sun upper right, shadows 145 degrees"],
)
