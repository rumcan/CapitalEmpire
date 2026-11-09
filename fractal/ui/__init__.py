"""ui: the rail, menus, panels, cards, tools and keys (T410 map; the ground truth is src/ui/** and the tool and mode files in src/game)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui',
    rung=1,
    title='Rail, menus, panels, cards, tools and keys',
    purpose='Everything the player clicks: the rail and its flyouts, the cards and panels, the tools in hand, the course picker, the Keys sheet and the tooltips.',
    requires=['A locked tool is dimmed in place with its reason; a click on it says why and opens nothing (Rail.tsx header).', 'Flyouts open to the side, one column per level, as many levels as the tools need (flyout-menu.ts header).', 'Modes never steal a click, and Esc closes the topmost card first (tool-modes.ts escapeLadder).'],
    below=['core', 'render', 'course', 'play', 'business', 'town'],
    above=['core'],
    dual='derived: the UI draws state the game holds; the undos are in each process',
    rules=['no horizontal scrollbars, and side flyouts', 'no flat colour washes', 'new art used everywhere', 'performance is a hard gate', 'a slider drag is one undo step'],
    impl='describe',
)
