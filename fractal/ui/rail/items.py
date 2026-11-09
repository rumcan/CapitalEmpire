"""ui.rail.items: The rail's groups and locks (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.rail.items',
    rung=3,
    title="The rail's groups and locks",
    purpose="The rail's groups and their tools as data, with the lock each tool carries and the NEW badge.",
    requires=["RAIL lists the rail's groups; railItemsOf(t) gives the groups that hold tool t (rail-items.ts:90).", 'toolLock says why a tool is locked, with the progress that unlocks it (rail-items.ts:104).'],
    files=['src/ui/rail-items.ts'],
    dynamics=[
        Fn(name='RAIL', at='src/ui/rail-items.ts:42', does="the rail's groups in order", sig='readonly RailItem[]'),
        Fn(name='railItemsOf', at='src/ui/rail-items.ts:90', does='the groups that hold a tool', sig='(t: Tool) => RailItem[]'),
        Fn(name='toolLock', at='src/ui/rail-items.ts:104', does='why a tool is locked, or null', sig='(ui, t) => string | null')],
    inputs=['a tool id; the progressive UI state'],
    outputs=['RailItem list; a lock reason'],
    tests=['ui-rail.test.ts', 't187-gaps.test.ts'],
    below=['core'],
    above=['ui.rail.buttons', 'ui.keys.sheet'],
    dual='derived from the rail table; nothing to undo',
    rules=['no horizontal scrollbars, and side flyouts'],
    impl='describe',
)
