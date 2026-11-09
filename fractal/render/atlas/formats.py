"""render.atlas.formats: the block formats the atlas pages can upload as (atlas-formats.ts), described; the GPU pick needs the live context."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.atlas.formats", rung=3, title="GPU texture formats",
    purpose="Pick the texture format the GPU takes: BC7 on desktops, else ASTC 4x4 or ETC2, else RGBA8.",
    requires=[
        "pickFormat chooses BC7, then ASTC, then ETC2 from the context's extensions; with none it returns null (RGBA8 is used).",
        "Each block format has a transparent 4 x 4 clear block, so an empty cell is see-through.",
    ],
    owns=["the BC7, ASTC and ETC2 format constants (internal enum, bpp, transcode id)"],
    files=["src/game/atlas-formats.ts"],
    dynamics=[Fn(name="pickFormat", at="src/game/atlas-formats.ts:21", does="the block format this GPU supports, or null", sig="pickFormat(gl)")],
    inputs=["the WebGL2 context's extensions"],
    outputs=["a KtxFormat or null"],
    tests=["tests/atlas-formats.test.ts"],
    below=["render.atlas.ktx2"], above=["render.atlas.upload"],
    dual=None, seams=["KtxFormat consumed by atlas-ktx2.ts ktx2Source"],
    impl="describe",
)
