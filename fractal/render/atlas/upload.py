"""render.atlas.upload: the atlas's GPU side: the resident low set, the streamed cell tiers, the cell lookup and the uploads (atlas-gl.ts), described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.atlas.upload", rung=3, title="Atlas GPU upload",
    purpose="Put the resident low set and the streamed cells on the GPU a few per frame, so a sprite is never blank.",
    requires=[
        "The low set (every page from mip lowBase down) is always resident and loads before the first frame.",
        "Cells stream in a few per frame; until a cell arrives its sprite draws from the low set (soft, never blank).",
    ],
    owns=["the texture arrays of cell slots", "the R32I cell lookup texture"],
    files=["src/game/atlas-gl.ts"],
    dynamics=[
        Fn(name="webpSource", at="src/game/atlas-gl.ts:16", does="an AtlasSource that decodes WebP page levels", sig="webpSource(pages)"),
        Fn(name="AtlasGL", at="src/game/atlas-gl.ts:38", does="the class that owns the arrays, the lookup and the uploads", sig="class AtlasGL"),
    ],
    inputs=["page levels from ktx2Source or webpSource", "PageLoad and PageWant from atlas-pages.ts"],
    outputs=["GPU texture arrays and the cell lookup for the sprite shaders"],
    tests=["tests/atlas-pages.test.ts", "tests/ext-asset-residency.test.ts"],
    below=["render.atlas.pages", "render.atlas.ktx2", "render.atlas.formats"], above=["render.gl.frame"],
    dual=None, seams=["PageLoad / PageWant (atlas-pages.ts) in; textures out to gl.ts"],
    rules=["no visible tiling", "performance is a hard gate"],
    impl="describe",
)
