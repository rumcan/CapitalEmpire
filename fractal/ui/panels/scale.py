"""ui.panels.scale: The UI scale (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

import math


def clamp_ui_scale(v, knobs: dict) -> float:
    """the nearest of UI_SCALES to v, a number or a numeric string; the default when it is not one (uiScale.ts clampUiScale)"""
    n = None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        n = float(v)
    elif isinstance(v, str) and v.strip() != "":
        try:
            n = float(v)
        except ValueError:
            n = None
    if n is None or not math.isfinite(n):
        return knobs["default"]
    a = knobs["default"]
    for b in knobs["scales"]:
        if abs(b - n) < abs(a - n):
            a = b
    return a

HOLON = Holon(
    id='ui.panels.scale',
    rung=3,
    title='The UI scale',
    purpose='The UI scale: the nearest of 90, 100, 110 or 125 percent to the stored value, applied to the UI layer.',
    requires=['clampUiScale gives the nearest of UI_SCALES to a number, and 1 when the value is not a number (uiScale.ts:11).', 'The scale is stored per browser and read at boot (uiScale.ts header).'],
    files=['src/ui/uiScale.ts', 'src/utils/cn.ts'],
    dynamics=[
        Fn(name='clampUiScale', at='src/ui/uiScale.ts:11', does='the nearest UI scale to a value', sig='(v: unknown) => number'),
        Fn(name='applyUiScale', at='src/ui/uiScale.ts:27', does='sets the CSS variable --ui-scale', sig='(v: number) => number')],
    inputs=['a stored value'],
    outputs=['one of 0.9, 1, 1.1 or 1.25'],
    tests=['ui-a11y.test.ts'],
    below=['core'],
    above=['ui.rail'],
    dual='saveUiScale stores a new one; the default is 100 percent',
    rules=['no horizontal scrollbars, and side flyouts'],
    impl='native',
    params={'v': 'a number or a numeric string', 'knobs': 'steer values'},
    steer={'scales': [0.9, 1, 1.1, 1.25], 'default': 1},
    fn=clamp_ui_scale,
)
