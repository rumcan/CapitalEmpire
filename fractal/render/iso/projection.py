"""render.iso.projection: the isometric projection and the zoom clamp (iso.ts), ported. Steer: the tile half-size, the zoom limits."""
from fractal.holon import Fn, Holon

STEER = {"hw": 64.0, "hh": 32.0, "zoom_min": 0.0125, "zoom_max": 0.3}


def clamp_zoom(z: float, knobs: dict | None = None) -> float:
    """the zoom held between zoom_min and zoom_max; a non-number gives zoom_max"""
    k = knobs or STEER
    if not isinstance(z, (int, float)) or z != z or z in (float("inf"), float("-inf")):
        return k["zoom_max"]
    return min(k["zoom_max"], max(k["zoom_min"], z))


def world_xy(x: float, y: float, knobs: dict | None = None) -> dict:
    """a world tile (x, y) on the screen: (x - y) times half a tile wide, (x + y) times half a tile high"""
    k = knobs or STEER
    return {"sx": (x - y) * k["hw"], "sy": (x + y) * k["hh"]}


HOLON = Holon(
    id="render.iso.projection", rung=3, title="Isometric projection and zoom clamp",
    purpose="Turn a world tile into its screen point and keep the zoom in its range.",
    requires=[
        "clampZoom holds z between ZOOM_MIN 0.0125 and ZOOM_MAX 0.3 and gives ZOOM_MAX for a non-number (iso.ts line 21).",
        "worldX and worldY: (x - y) times HW 64 and (x + y) times HH 32 (iso.ts lines 46 and 47).",
    ],
    owns=["the tile constants (TW 128, TH 64, HW 64, HH 32, MAP 1024, CELL 64)", "the zoom tier levels (LEVELS, PLAN_LEVELS, MID_LEVELS)"],
    files=["src/game/iso.ts"],
    dynamics=[
        Fn(name="clampZoom", at="src/game/iso.ts:21", does="holds the zoom in its range", sig="clampZoom(z)"),
        Fn(name="worldX", at="src/game/iso.ts:46", does="the screen x of a world tile", sig="worldX(x, y)"),
        Fn(name="worldY", at="src/game/iso.ts:47", does="the screen y of a world tile", sig="worldY(x, y)"),
        Fn(name="levelFor", at="src/game/iso.ts:52", does="the art level a zoom draws at", sig="levelFor(z)"),
    ],
    inputs=["a world tile (x, y)", "a zoom"],
    outputs=["screen px", "the clamped zoom"],
    tests=["tests/straight-views.test.ts", "tests/atlas-pages.test.ts", "tests/blocklots.test.ts"],
    below=[], above=["render.iso", "render.sprites.pack", "core.boot.options"],
    dual="zoomAt (engine.ts zoom out is the inverse step)",
    impl="native", fn=clamp_zoom, steer=dict(STEER),
    params={"z": "float, a zoom"},
)
