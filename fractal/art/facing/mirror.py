"""art.facing.mirror: drawnAs (mirror.ts), the one rule for which picture a flip draws. Not ported yet: it reads the partner tables of several libraries."""
from fractal.holon import Fn, Holon


def drawn_as(id: str, kind: str, flip: bool, knobs: dict | None = None) -> list:
    """the picture id drawn and its flip (not ported yet)"""
    raise NotImplementedError("art.facing.mirror: port drawnAs (src/game/mirror.ts:33) with its tables: OBJECT_REPLACE, AXIS_TURN, VIEW_TURN, VIEW_ART")


HOLON = Holon(
    id="art.facing.mirror", rung=3, title="Drawn-as rule",
    purpose="Pick the picture drawn for an item and a flip: partner view for a building, none for trees, bushes and axis plants.",
    requires=[
        "drawnAs never returns a flip for a building, a natural kind (tree, bush, shrub, flower, palm, rock), a kit picture or an axis picture (mirror.ts line 33).",
        "Left-lit trees are the one drawn mirrored on purpose (tree-sun.ts); that case is in engine.ts, not here.",
    ],
    owns=["NATURAL_KINDS (tree, bush, shrub, flower, palm, rock)"],
    files=["src/game/mirror.ts"],
    dynamics=[
        Fn(name="drawnAs", at="src/game/mirror.ts:33", does="the picture id and flip drawn for an item and a flip", sig="drawnAs(it, flip)"),
        Fn(name="isBuilding", at="src/game/mirror.ts:29", does="whether an item is a building", sig="isBuilding(it)"),
    ],
    inputs=["a LibItem and a flip"],
    outputs=["the picture id drawn and its flip (always false for buildings)"],
    tests=["tests/axis-views.test.ts", "tests/axis-headings.test.ts", "tests/garage-views.test.ts", "tests/eight-lot-views.test.ts", "tests/lot-facing.test.ts"],
    below=["art.library.views", "art.eight.registry"], above=["art.facing", "core.engine.orchestra"],
    dual=None,
    rules=["never mirror lit sprites", "new art used everywhere"],
    impl="native", fn=drawn_as,
    port="todo: port drawnAs with its partner tables (inputs: an item dict {id, kind}, flip; outputs: [picture id, flip]; TS mirror.ts:33, the tables in views-library.ts, axis-library.ts, extra-views-library.ts and object-eight-library.ts)",
    params={"id": "str, the library id", "flip": "bool"},
)
