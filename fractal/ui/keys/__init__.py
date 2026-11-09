"""ui.keys: Keys, tooltips and the guide (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.keys',
    rung=2,
    title='Keys, tooltips and the guide',
    purpose="The Keys sheet, the styled tooltip, and the guide's pulse and tour that point at a control.",
    requires=['The Keys sheet lists every key, laid out as the menus are (keymap.ts header).', 'A tooltip names the control, its key, and why it is locked (tip.ts tipText).'],
    below=['ui.rail', 'ui.flyouts'],
    above=['ui.rail'],
    dual='closing the sheet or the tooltip; the guide ends its pulse',
    rules=['no flat colour washes'],
)
