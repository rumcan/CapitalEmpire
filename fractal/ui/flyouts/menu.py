"""ui.flyouts.menu: Flyout rows and the keyboard walk (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='ui.flyouts.menu',
    rung=3,
    title='Flyout rows and the keyboard walk',
    purpose='The rows of each flyout, and the keys that walk them.',
    requires=["menuOf builds the rows of a rail group's flyout from the tools (flyout-menu.ts:69).", 'navKey moves the focus and says when to pick or to close (flyout-menu.ts:212).'],
    files=['src/ui/flyout-menu.ts'],
    dynamics=[
        Fn(name='menuOf', at='src/ui/flyout-menu.ts:69', does="the rows of a rail group's flyout", sig='(item: RailItem, c: MenuCtx) => MenuRow[]'),
        Fn(name='navKey', at='src/ui/flyout-menu.ts:212', does='one key on the flyouts: the new state, the pick or the close', sig='(rows, s, key) => NavOut')],
    inputs=['a rail item; a key'],
    outputs=['MenuRow list; NavOut'],
    tests=['ui-flyouts.test.ts', 'kit.test.ts', 'land-sale.test.ts'],
    below=['ui.rail.items'],
    above=['ui.flyouts.panel'],
    dual='Esc: navKey returns close, which shuts the flyouts',
    rules=['no horizontal scrollbars, and side flyouts'],
    impl='native',
    port="todo: port navKey (flyout-menu.ts:212), columnsOf (:203) and leavesOf (:193) over a MenuRow tree; menuOf (:69) needs the rail's table",
    fn=ported,
)
