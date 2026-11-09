"""ui.rail: The rail and the footer (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.rail',
    rung=2,
    title='The rail and the footer',
    purpose="The rail's groups, their buttons, and the town footer that sits in the bottom right corner.",
    requires=['Each rail group holds its tools in order; railItemsOf lists the groups that hold a tool (rail-items.ts:90).', 'The town footer stands in the bottom right corner, clear of the minimap (footer-layout.ts header).'],
    below=['core'],
    above=['ui.flyouts', 'ui.tools'],
    dual='pickTool with Select returns the rail to Select (tool-modes.ts:21)',
    rules=['no horizontal scrollbars, and side flyouts'],
)
