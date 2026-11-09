"""ui.keys.sheet: The Keys sheet (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.keys.sheet',
    rung=3,
    title='The Keys sheet',
    purpose='Help, Keys: every key on one sheet, laid out as the menus are.',
    requires=["keySheet lists the rail's numbered groups and the keys that work anywhere (keymap.ts:73).", 'A locked tool or group is dimmed with its reason on the sheet (KeysSheet.tsx header).'],
    files=['src/ui/keymap.ts', 'src/ui/KeysSheet.tsx', 'src/game/text-entry.ts'],
    dynamics=[
        Fn(name='keySheet', at='src/ui/keymap.ts:73', does="the Keys sheet's sections", sig='(o: {golf, ui, range, lab?}) => KeySection[]'),
        Fn(name='KeysSheet', at='src/ui/KeysSheet.tsx:8', does='the Keys sheet', sig='({sections}) => JSX')],
    inputs=['the mode flags and the progressive UI state'],
    outputs=['KeySection list'],
    tests=['ui-keys.test.ts', 'route-input.test.ts'],
    below=['ui.rail.items'],
    above=['core'],
    dual='close the sheet (Esc, or ? and F1 again)',
    rules=['no horizontal scrollbars, and side flyouts'],
    impl='describe',
)
