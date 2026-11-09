"""render.labels.place: the label placement pass (label-place.ts LabelPlacer, ColumnPlacer), described: pure but a class with per-frame state, not ported."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.labels.place", rung=3, title="Label placement",
    purpose="Give each label its anchor if free, else the nearest free slot above or below, else hide it at this zoom.",
    requires=[
        "By priority (PRI: hint 200, name 100, count 90, warn 80, marker 70, area 60, growth 50, standIn 10) the highest label takes its anchor first (label-place.ts line 23).",
        "A label keeps last frame's slot while that slot stays free (stable across frames).",
        "Money floats are placed after the labels and avoid them (label-place.ts header).",
    ],
    owns=["the placed boxes of the frame (LabelPlacer)"],
    files=["src/game/label-place.ts"],
    dynamics=[
        Fn(name="LabelPlacer", at="src/game/label-place.ts:30", does="places the frame's labels with no overlaps", sig="class LabelPlacer"),
        Fn(name="ColumnPlacer", at="src/game/label-place.ts:157", does="places money floats in their own columns", sig="class ColumnPlacer"),
    ],
    inputs=["the frame's PlaceLabel list (world-labels.ts)"],
    outputs=["the placed label boxes (x, y, shown)"],
    tests=["tests/label-place.test.ts", "tests/ui-grow-label.test.ts", "tests/standin-labels.test.ts"],
    below=[], above=["render.labels.collect"],
    dual="a label hidden at this zoom and shown again when there is room (the placer's own undo)",
    impl="describe",
)
