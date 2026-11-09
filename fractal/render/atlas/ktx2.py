"""render.atlas.ktx2: the atlas pages transcoded from KTX2 in workers (atlas-ktx2.ts and its worker), described: it needs Worker and the GPU."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.atlas.ktx2", rung=3, title="KTX2 transcode",
    purpose="Load the production atlas as GPU-compressed blocks, one byte per texel, transcoded in workers at load.",
    requires=[
        "ktx2Source transcodes each page level in workers (3 by default) into the picked block format.",
        "The dev server and any build without the KTX2 files use the WebP pages as RGBA8 (ktx2Url swaps the extension).",
    ],
    owns=["the transcode worker pool"],
    files=["src/game/atlas-ktx2.ts", "src/game/atlas-ktx2.worker.ts"],
    dynamics=[Fn(name="ktx2Source", at="src/game/atlas-ktx2.ts:12", does="an AtlasSource that transcodes pages to blocks in workers", sig="ktx2Source(pages, format, workers = 3)")],
    inputs=["page level URLs (.ktx2 next to each .webp)", "a KtxFormat from pickFormat"],
    outputs=["LevelData blocks for atlas-gl.ts"],
    tests=["tests/atlas-formats.test.ts", "tests/ext-bunker-stage-atlas.test.ts"],
    below=["render.atlas.formats"], above=["render.atlas.upload"],
    dual=None, seams=["LevelData (atlas-gl.ts) out"],
    impl="describe",
)
