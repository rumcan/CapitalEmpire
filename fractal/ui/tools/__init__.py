"""ui.tools: Tools and modes in hand (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.tools',
    rung=2,
    title='Tools and modes in hand',
    purpose='The tool in hand: its mode, its header, its tile, and its placement, paint and tool state, which the engine calls.',
    requires=['pickTool closes the side modes on any tool but Select (tool-modes.ts:18 and :21).', 'A slider drag is one undo step, recorded on release (setting-hold.ts header).'],
    below=['core', 'course', 'town', 'business'],
    above=['ui.rail', 'ui.course'],
    dual='Esc cancels a drag or steps back one level (tool-modes.ts escapeLadder)',
    rules=['a slider drag is one undo step'],
)
