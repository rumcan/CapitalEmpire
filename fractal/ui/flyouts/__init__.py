"""ui.flyouts: Flyout menus (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.flyouts',
    rung=2,
    title='Flyout menus',
    purpose='The cascading menus that open to the side of a rail group, a row with children, and their keyboard walk.',
    requires=['A row with children opens the next flyout to its right; a leaf picks its tool and closes them (flyout-menu.ts header).', 'navKey walks the flyouts by key and says when to close (flyout-menu.ts:212).'],
    below=['ui.rail'],
    above=['ui.rail'],
    dual='Esc or a click off the rail closes the flyouts (Flyouts.tsx header)',
    rules=['no horizontal scrollbars, and side flyouts'],
)
