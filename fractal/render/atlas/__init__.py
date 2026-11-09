"""render.atlas: the sprite atlas, from the page plan to the GPU textures (T410). Children: the pages budget, the block formats, the KTX2 transcode, the upload."""
from fractal.holon import Holon

HOLON = Holon(
    id="render.atlas", rung=2, title="Sprite atlas",
    purpose="Keep the sprite pictures on the GPU within budget: resident pages and streamed cells, in RGBA8 or a block format.",
    requires=["The atlas is cut into 4 x 4 cells per page; cells, not whole pages, stream (atlas-pages.ts GRID, BORDER)."],
    below=["art"], above=["render.gl", "render.sprites"],
    rules=["performance is a hard gate (ground plus tiles at most 192 MB)"],
)
