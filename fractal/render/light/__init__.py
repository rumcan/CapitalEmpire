"""render.light: the one sun at the upper right: its patches and clouds, the tree sides it lights, and a shading preview of any height array (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="render.light", rung=2, title="Sun and clouds",
    purpose="Light the town from one sun at the upper right: the drifting cloud patches, the side each tree is lit from, and a preview of the shading.",
    requires=["The sun is at the upper right; a tree lit from the left is drawn mirrored so its light comes from the right (tree-sun.ts)."],
    below=["art"], above=["render.gl", "core.tick.frame"],
    rules=["sun upper right, shadows 145 degrees", "no flat colour washes", "no visible tiling"],
)
