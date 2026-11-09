"""ui.course: Course panels and brushes (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.course',
    rung=2,
    title='Course panels and brushes',
    purpose="The course's own panels (holes, buildings, props, practice) and the brushes, swatches and grass editor.",
    requires=["The hole strip lists the course's holes and adds one with newHole (HoleStrip.tsx:7).", "A surface swatch shows the brush's real look, not a flat colour (swatch-puck.ts puckLookOf)."],
    below=['course', 'ui.tools'],
    above=['ui.rail'],
    dual="the header's undo arrows (ToolHead, the Holes panel) and the drag's one undo step",
    rules=['no flat colour washes', 'new art used everywhere'],
)
