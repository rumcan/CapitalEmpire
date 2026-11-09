"""ui.panels: Panels, results and thumbnails (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.panels',
    rung=2,
    title='Panels, results and thumbnails',
    purpose='The stats chips and status marks, the minimap and night panel, the results, the thumbnails and the UI scale.',
    requires=['A status mark is a shape as well as a colour: ok, fail, warn, growing, up, down, info (status-icon.ts STATUS_ICON).', 'The UI scale is one of 90, 100, 110 or 125 percent (uiScale.ts UI_SCALES).'],
    below=['core', 'render'],
    above=['ui.rail'],
    dual='derived from state; the UI scale is stored per browser',
    rules=['highlights are textured', 'new art used everywhere'],
)
