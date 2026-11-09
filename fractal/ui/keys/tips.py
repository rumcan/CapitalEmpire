"""ui.keys.tips: The tooltip (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def tip_text(t: dict, knobs: dict) -> str:
    """the tooltip as one line: the name, the key in brackets, and the why after the separator (tip.ts tipText)"""
    s = str(t["name"])
    if t.get("key"):
        s += f" ({t['key']})"
    if t.get("why"):
        s += f" {knobs['why_sep']} {t['why']}"
    return s

HOLON = Holon(
    id='ui.keys.tips',
    rung=3,
    title='The tooltip',
    purpose="The styled tooltip: a control's name, its key and why it is locked or refused.",
    requires=['tipText joins the name, the key in brackets and the why after a dot (tip.ts:11).', 'The tooltip shows on hover after TIP_DELAY_MS and at once on keyboard focus (Tooltip.tsx header).'],
    files=['src/ui/tip.ts', 'src/ui/Tooltip.tsx'],
    dynamics=[
        Fn(name='tipText', at='src/ui/tip.ts:11', does='the tooltip as one line', sig='(t: TipParts) => string'),
        Fn(name='tipAttrs', at='src/ui/tip.ts:7', does='the data attributes a control carries', sig='(t: TipParts) => Record<string, string>'),
        Fn(name='TooltipLayer', at='src/ui/Tooltip.tsx:18', does='the one tooltip layer', sig='() => JSX')],
    inputs=["a control's name, key and why"],
    outputs=['the tooltip text and attributes'],
    tests=['ui-a11y.test.ts'],
    below=['ui.keys.sheet'],
    above=['ui.rail.buttons'],
    dual='derived: the tooltip hides on leave or blur',
    rules=['no flat colour washes'],
    impl='native',
    params={'t': 'dict: name, key (optional), why (optional)'},
    steer={'why_sep': '·', 'delay_ms': 450},
    fn=tip_text,
)
