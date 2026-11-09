"""art.facing.extra: the diagonal extra views' partner turn (extra-views.ts extraUnmirror), ported. Steer: none (the pairs come from the sets)."""
from fractal.holon import Fn, Holon

STEER: dict = {}


def extra_unmirror(id: str, flip: bool, sets: dict | None = None, knobs: dict | None = None) -> str | None:
    """the extra view a flip turns to: sets maps a base to its four views [ne, se, sw, nw]; ne and se swap, sw and nw swap; None when id is not an extra view"""
    turn: dict = {}
    for ne, se, sw, nw in (sets or {}).values():
        turn[ne], turn[se], turn[sw], turn[nw] = se, ne, nw, sw
    if id not in turn:
        return None
    return turn[id] if flip else id


HOLON = Holon(
    id="art.facing.extra", rung=3, title="Extra-view partner turn",
    purpose="When a diagonal extra view is flipped, draw its partner (NE with SE, SW with NW) instead of mirroring it.",
    requires=[
        "The pairs are NE with SE and SW with NW, from each base's four views (extra-views.ts lines 4 to 10).",
        "A non-flipped extra view draws as itself; a flipped one draws its partner; a non-extra id gives null.",
    ],
    owns=["EXTRA_VIEW_BASE (view id to its axis base)", "the TURN partner map"],
    files=["src/game/extra-views.ts"],
    dynamics=[
        Fn(name="extraUnmirror", at="src/game/extra-views.ts:10", does="the partner extra view for a flip, or null", sig="extraUnmirror(id, flip)"),
        Fn(name="EXTRA_VIEW_BASE", at="src/game/extra-views.ts:4", does="the axis base of each extra view", sig="EXTRA_VIEW_BASE: ReadonlyMap"),
    ],
    inputs=["a view id and a flip", "the EXTRA_VIEW_SETS table"],
    outputs=["the partner view id, the id itself, or null"],
    tests=["tests/garage-views.test.ts", "tests/kit.test.ts", "tests/axis-views.test.ts"],
    below=["art.library.views"], above=["art.facing", "art.facing.mirror"],
    dual="a flip applied twice returns the original view (the turn is its own inverse)",
    rules=["never mirror lit sprites"],
    impl="native", fn=extra_unmirror, steer=dict(STEER),
    params={"id": "str, a view id", "flip": "bool", "sets": "dict, base -> [ne, se, sw, nw] (EXTRA_VIEW_SETS)"},
)
