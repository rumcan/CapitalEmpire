"""art.newart.sizes: a picture's pixel limit at the closest zoom (sizes.ts atlasRes), ported. Steer: the atlas size and the mip 0 scale."""
from fractal.holon import Fn, Holon

STEER = {"atlas_size": 2048, "mip0": 0.6}


def atlas_res(tex: list, quad: list, knobs: dict | None = None) -> float:
    """the atlas pixels a picture holds per display px of its quad: min over x and y of (its uv span times the atlas size) / (its quad span)"""
    k = knobs or STEER
    _, u0, v0, u1, v1 = tex
    x0, y0, x1, y1 = quad
    rx = (u1 - u0) * k["atlas_size"] / (x1 - x0) if x1 > x0 else 0.0
    ry = (v1 - v0) * k["atlas_size"] / (y1 - y0) if y1 > y0 else 0.0
    return min(rx, ry)


HOLON = Holon(
    id="art.newart.sizes", rung=3, title="Picture pixel limit",
    purpose="Say the largest a picture may be drawn at the closest zoom without showing more pixels than its atlas holds.",
    requires=[
        "atlasRes(it) is min over x and y of (uv span times ATLAS_SIZE 2048) over the quad's span (sizes.ts line 13).",
        "pixelLimit is atlasRes divided by ATLAS_MIP0 0.6 (sizes.ts line 20).",
    ],
    owns=["PIXEL_LIMIT (per library item, Float64Array)", "PIXEL_SLACK 1.02"],
    files=["src/game/sizes.ts"],
    dynamics=[
        Fn(name="atlasRes", at="src/game/sizes.ts:13", does="the atlas pixels per display px of a picture", sig="atlasRes(it)"),
        Fn(name="pixelLimit", at="src/game/sizes.ts:20", does="the largest draw scale a picture holds at the closest zoom", sig="pixelLimit(it)"),
    ],
    inputs=["a library item's tex and quad"],
    outputs=["the atlas res per display px, the pixel limit"],
    tests=["tests/sizes.test.ts", "tests/size-range.test.ts", "tests/straight-views.test.ts", "tests/car-size-studio.test.ts"],
    below=["art.library.index"], above=["art.newart.swap", "render.sprites.pack"],
    dual=None,
    impl="native", fn=atlas_res, steer=dict(STEER),
    params={"tex": "list, [page, u0, v0, u1, v1]", "quad": "list, [x0, y0, x1, y1] in display px"},
)
