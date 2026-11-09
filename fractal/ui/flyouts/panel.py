"""ui.flyouts.panel: Flyouts on the screen (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.flyouts.panel',
    rung=3,
    title='Flyouts on the screen',
    purpose='The flyouts drawn beside the rail, and the side menu row every button that opens a menu to the side uses.',
    requires=["A flyout's level opens to the right; a click off the rail and the flyouts closes them, and that click goes no further (Flyouts.tsx header).", "The side menu row runs the panel's full width with a blue edge, so the user sees there is a menu (SideMenuRow.tsx header)."],
    files=['src/ui/Flyouts.tsx', 'src/ui/SideMenuRow.tsx'],
    dynamics=[
        Fn(name='Flyouts', at='src/ui/Flyouts.tsx:62', does='the cascading flyouts', sig='(FlyoutsProps) => JSX'),
        Fn(name='columnWidths', at='src/ui/Flyouts.tsx:28', does='the width of each column', sig='(cols) => number[]'),
        Fn(name='SideMenuRow', at='src/ui/SideMenuRow.tsx:29', does='the full-width row that opens a menu to the side', sig='({label, sub, value, lead, open, ...}) => JSX')],
    inputs=['the rail group and the open path'],
    outputs=["the flyout columns; the row's click"],
    tests=['ui-flyouts.test.ts', 'season-card.test.ts'],
    below=['ui.flyouts.menu'],
    above=['ui.rail.buttons'],
    dual='Esc or a click off the rail closes the flyouts',
    rules=['no horizontal scrollbars, and side flyouts', 'no flat colour washes'],
    impl='describe',
)
