"""art.library.views: the east, axis, four-view and extra-view picture rows appended to LIBRARY, described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="art.library.views", rung=3, title="View pictures",
    purpose="Append the picture views a building or prop is drawn from: east, axis (screen-axis plants and props), four-view and the diagonal extras.",
    requires=[
        "unmirror(id, flip) swaps a flipped building to its partner view when one exists, else draws it unflipped (views-library.ts line 962).",
        "AXIS_TURN and AXIS_HEADING give each axis picture its heading; AXIS_NEW lists the new axis pictures.",
    ],
    owns=["the view rows and their partner tables (VIEW_TURN, VIEW_EAST, AXIS_SETS, EXTRA_VIEW_SETS)"],
    files=["src/game/east-library.ts", "src/game/axis-library.ts", "src/game/views-library.ts", "src/game/extra-views-library.ts", "src/game/golf/range-look.ts", "src/game/golf/range-pics.ts"],
    dynamics=[
        Fn(name="appendEast", at="src/game/east-library.ts:27", does="appends the east pictures", sig="appendEast(library, pages)"),
        Fn(name="appendAxisViews", at="src/game/axis-library.ts:295", does="appends the axis pictures", sig="appendAxisViews(library, pages)"),
        Fn(name="appendViews", at="src/game/views-library.ts:966", does="appends the four-view pictures", sig="appendViews(library, pages)"),
        Fn(name="appendExtraViews", at="src/game/extra-views-library.ts:73", does="appends the diagonal extra views", sig="appendExtraViews(library, pages)"),
        Fn(name="unmirror", at="src/game/views-library.ts:962", does="the partner view of a flipped building, or it unflipped", sig="unmirror(id, flip)"),
    ],
    inputs=["the LIBRARY array and the page list"],
    outputs=["view rows in LIBRARY"],
    tests=["tests/axis-views.test.ts", "tests/axis-headings.test.ts", "tests/garage-views.test.ts", "tests/lettering.test.ts", "tests/newart-default.test.ts", "tests/standin-needs.test.ts"],
    below=["art.library.index"], above=["art.facing.mirror", "art.facing.extra"],
    dual="MISSING: an appended view cannot be removed at runtime (saved indices)",
    rules=["never mirror lit sprites", "straight views turned 8 degrees"],
    impl="describe",
)
