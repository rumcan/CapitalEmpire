"""render: the renderer (WebGL2 and the 2D overlay): atlases, sprites, shadows, the sun, lamps, exposure, labels, the camera and picking (T410, #1110)."""
from fractal.holon import Holon

HOLON = Holon(
    id="render", rung=1, title="Renderer",
    purpose="Draw each frame: the baked ground, the sprites from the atlas, their shadows, the sun and clouds, the lamps at night, the labels, and the camera.",
    requires=[
        "The sun is at the upper right and sprite shadows fall at 145 degrees (cast-shadow.ts CAST_DEFAULT angle 145).",
        "Overlapping shadows take the darkest of them, never their product (gl.ts beginShadows uses MAX blending).",
        "The atlas budget is 96 MB on a hi-dpi screen and 32 MB at dpr 1 (atlas-pages.ts atlasBudget).",
        "The zoom stays between ZOOM_MIN and ZOOM_MAX = 0.3 (iso.ts clampZoom).",
        "World labels never overlap: one placement pass each frame, by priority (label-place.ts PRI).",
        "A tree lit from the left is drawn mirrored so its light comes from the right (tree-sun.ts TREE_MIRROR, engine.ts treeSprites); no other lit picture is mirrored.",
    ],
    below=["art"], above=["core"],
    seams=["LibItem and Prop (types.ts) in; packed Float32Array instance buffers out (gl.ts strides: sprite 20, shadow 16, vector 20, point 6 floats)."],
    rules=["sun upper right, shadows 145 degrees", "never mirror lit sprites", "no flat colour washes", "no visible tiling", "performance is a hard gate (ground plus tiles at most 192 MB)", "new art used everywhere"],
)
