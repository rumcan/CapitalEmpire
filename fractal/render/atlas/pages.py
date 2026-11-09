"""render.atlas.pages: the atlas memory budget by screen density (atlas-pages.ts atlasBudget), ported. Steer: the hi-dpi and dpr-1 budgets in MB."""
from fractal.holon import Fn, Holon

MB = 1024 * 1024
STEER = {"hi_dpi_mb": 96, "dpr1_mb": 32}


def atlas_budget(dpr: float = 1, knobs: dict | None = None) -> dict:
    """the atlas budget in bytes for a screen at this device pixel ratio: hi_dpi_mb above dpr 1, dpr1_mb at dpr 1 (the game's 96 and 32 MB)"""
    k = knobs or STEER
    mb = k["hi_dpi_mb"] if dpr > 1 else k["dpr1_mb"]
    return {"dpr": dpr, "mb": mb, "bytes": int(mb * MB)}


HOLON = Holon(
    id="render.atlas.pages", rung=3, title="Atlas pages budget",
    purpose="Say how much GPU memory the sprite atlas may use on this screen, so the cells that stream in fit.",
    requires=[
        "atlasBudget is 96 MB when dpr is above 1 and 32 MB otherwise (atlas-pages.ts line 30).",
        "A page is GRID x GRID = 4 x 4 cells; a cell is streamed only when a street at the closest zoom draws from it (T080).",
    ],
    owns=["the page plan (planAtlas: pages, levels, slot shapes)"],
    files=["src/game/atlas-pages.ts", "src/game/ext/asset-residency/index.ts"],
    dynamics=[
        Fn(name="atlasBudget", at="src/game/atlas-pages.ts:30", does="the atlas budget in bytes for a screen's dpr", sig="atlasBudget(dpr: number): number"),
        Fn(name="planAtlas", at="src/game/atlas-pages.ts:73", does="plans the resident low set and the streamed cell tiers within a budget", sig="planAtlas(o: {pages, size, levels, bpp, budget, finest, grid?, maxLayers?})"),
        Fn(name="neededLevel", at="src/game/atlas-pages.ts:93", does="the mip level a zoom needs", sig="neededLevel(zoom, dpr, plan, mip0)"),
    ],
    inputs=["the screen's dpr", "the zoom"],
    outputs=["a byte budget (atlas_budget) and the page plan"],
    tests=["tests/atlas-pages.test.ts", "tests/kit.test.ts", "tests/lab-boot.test.ts"],
    below=["art.library.index"], above=["render.atlas", "core.boot.options"],
    dual=None, seams=["Budget in MB from boot options (boot.ts atlasMB)"],
    rules=["performance is a hard gate (ground plus tiles at most 192 MB)"],
    impl="native", fn=atlas_budget, steer=dict(STEER),
    params={"dpr": "float, the screen's device pixel ratio", "knobs": "filled from fractal/_steer, not typed"},
)
