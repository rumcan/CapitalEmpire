"""ui.tools.modes: Modes, Esc and the tool header (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='ui.tools.modes',
    rung=3,
    title='Modes, Esc and the tool header',
    purpose='Which side mode is open, what Esc and a right click step back, and the tool header every panel shows.',
    requires=['pickTool closes the side modes on any tool but Select (tool-modes.ts:18 and :21).', 'escapeLadder steps back one level: the topmost card, then the hand, then Select (tool-modes.ts:64).'],
    files=['src/game/tool-modes.ts', 'src/ui/setting-hold.ts', 'src/ui/ToolHead.tsx', 'src/game/golf/cursors.ts', 'src/game/route-input.ts'],
    dynamics=[
        Fn(name='pickTool', at='src/game/tool-modes.ts:21', does='picks a tool and closes the side modes', sig='(m, t) => boolean'),
        Fn(name='escapeLadder', at='src/game/tool-modes.ts:64', does='the next Esc step', sig='(l: EscLadder) => EscStep'),
        Fn(name='rightClickLadder', at='src/game/tool-modes.ts:83', does='the next right click step', sig='(l, o) => ClickStep'),
        Fn(name='installSettingHold', at='src/ui/setting-hold.ts:10', does='tells the Paint tool a slider is held and let go', sig='(hold) => () => void'),
        Fn(name='ToolHead', at='src/ui/ToolHead.tsx:6', does="a tool panel's header", sig='({icon, title, desc, children}) => JSX')],
    inputs=['the open cards and the tool in hand'],
    outputs=['the next mode; the step Esc takes'],
    tests=['tool-modes.test.ts', 'ui-rail.test.ts', 'ui-keys.test.ts', 'paint-polish.test.ts'],
    below=['core'],
    above=['ui.tools.paint', 'ui.tools.place', 'ui.course.panels'],
    dual='escapeLadder steps back one level; a slider drag is one undo step (setting-hold.ts)',
    rules=['a slider drag is one undo step'],
    impl='native',
    steer={'esc_order': ['scene', 'talk', 'help', 'menu', 'looks', 'bunkers', 'event', 'grass', 'stats', 'panel', 'bag', 'cards']},
    port='todo: port escapeLadder (tool-modes.ts:64) and rightClickLadder (:83) over the EscLadder dict; pickTool (:21) is short',
    fn=ported,
)
