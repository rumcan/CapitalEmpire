"""ui.rail.buttons: The rail's buttons (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.rail.buttons',
    rung=3,
    title="The rail's buttons",
    purpose="The rail's buttons: a rule after Select, each item with no key letter, a locked item dimmed with its lock, and the NEW badge.",
    requires=['A locked item is dimmed in place with a lock; a click says Unlocks with, and nothing opens (Rail.tsx header).', "The NEW badge stays until the item's new tools are first opened (Rail.tsx header)."],
    files=['src/ui/Rail.tsx', 'src/game/setting-labels.ts'],
    dynamics=[
        Fn(name='Rail', at='src/ui/Rail.tsx:58', does="the rail's buttons", sig='({walk, entries, onPick, onLocked, onHover, ...}) => JSX'),
        Fn(name='NewBadge', at='src/ui/Rail.tsx:23', does='the NEW badge', sig='({className}) => JSX'),
        Fn(name='LockMark', at='src/ui/Rail.tsx:13', does='the lock mark', sig='({size}) => JSX')],
    inputs=['the rail entries and the picked tool'],
    outputs=['button clicks: onPick, onLocked, onHover'],
    tests=['ui-rail.test.ts', 'ui-a11y.test.ts', 'ui-menu-fixes.test.ts'],
    below=['ui.rail.items'],
    above=['ui.flyouts.panel'],
    dual='pickTool with Select returns to Select (tool-modes.ts:21)',
    rules=['no horizontal scrollbars, and side flyouts'],
    impl='describe',
)
