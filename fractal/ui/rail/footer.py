"""ui.rail.footer: The town footer and its place (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='ui.rail.footer',
    rung=3,
    title='The town footer and its place',
    purpose='The slim town footer in the bottom right corner, with its groups as buttons and its place worked out clear of the cards.',
    requires=['footerPlace puts the footer in the bottom right corner (FOOT_ANCHOR), clear of the minimap at the lower left (footer-layout.ts).', "The footer's flyouts open upward from it (TownFooter.tsx header)."],
    files=['src/ui/TownFooter.tsx', 'src/ui/footer-layout.ts'],
    dynamics=[
        Fn(name='TownFooter', at='src/ui/TownFooter.tsx:46', does='the town footer', sig='({boxRef, navRef, flyouts, raised, ...}) => JSX'),
        Fn(name='footerPlace', at='src/ui/footer-layout.ts:62', does="the footer's place and form from the room round it", sig='(o: FootRoom) => FootPlace')],
    inputs=['the room: width, lanes, blocks'],
    outputs=['FootPlace: x, compact, lift'],
    tests=['ui-rail.test.ts'],
    below=['ui.rail.items'],
    above=['ui.flyouts.menu'],
    dual='derived from the room each frame; nothing to undo',
    rules=['no horizontal scrollbars, and side flyouts'],
    impl='native',
    steer={'foot_margin': 12, 'foot_gap': 10, 'compact_cost': 160, 'foot_bottom': 12, 'foot_est_full': 300, 'foot_est_compact': 116, 'mid_half': 208, 'panel_w': 330, 'panel_gap': 8, 'panel_vh': 0.6},
    port='todo: port footerPlace (footer-layout.ts:62) and freeStretches (:39) and nearest (:50) on the steer values',
    fn=ported,
)
