"""art.eight.registry: the object facings table, built once from the eight-view sets (object-eight.ts objectFacings), described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="art.eight.registry", rung=3, title="Object facings registry",
    purpose="Build the one facings table from the eight-view sets and the four-view and axis fallbacks.",
    requires=["objectFacings is built once at load from OBJECT_EIGHT_SETS, the fourViews or axisViews fallback and sizeKey (object-eight.ts line 6)."],
    owns=["objectFacings (the built table)"],
    files=["src/game/object-eight.ts"],
    dynamics=[Fn(name="objectFacings", at="src/game/object-eight.ts:6", does="the built facings table for every object", sig="objectFacings = createObjectFacings(...)")],
    inputs=["OBJECT_EIGHT_SETS", "fourViews and axisViews from lots/preset-art.ts"],
    outputs=["objectFacings for the event art and the lots"],
    tests=["tests/object-eight.test.ts", "tests/eight-lot-views.test.ts", "tests/straight-views.test.ts", "tests/tournament-kit.test.ts"],
    below=["art.eight.core", "art.eight.library"], above=["art.eight"],
    dual=None,
    impl="describe",
)
