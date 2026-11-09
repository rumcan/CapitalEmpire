"""render.labels.collect: the frame's label collection and its pooled text widths (world-labels.ts WorldLabels), described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.labels.collect", rung=3, title="Label collection",
    purpose="Collect every label of the map for this frame, then hand them to the placer in one pass.",
    requires=["WorldLabels pools its labels and caches text widths by font: no allocation a frame once warm (world-labels.ts header)."],
    owns=["the frame's label pool and the width cache by font"],
    files=["src/game/world-labels.ts"],
    dynamics=[Fn(name="WorldLabels", at="src/game/world-labels.ts:28", does="collects the frame's labels and writes the placed ones", sig="class WorldLabels")],
    inputs=["labels from the business, town, course and range overlays"],
    outputs=["the placed labels drawn by the overlay"],
    tests=["tests/label-place.test.ts"],
    below=["render.labels.place"], above=["core.engine.overlay"],
    dual="a label not added this frame is simply not drawn (no state to undo)",
    impl="describe",
)
