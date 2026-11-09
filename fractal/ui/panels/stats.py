"""ui.panels.stats: Stat chips and status marks (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

import math


def status_check(op: str, knobs: dict, value=0, have=0, text: str = "", **_) -> object:
    """the status helpers of status-icon.ts: trend (up/down/null), afford (ok/fail), balance (warn/null), with (mark + text), icon (the mark)"""
    icons = knobs["icons"]
    if op == "icon":
        return icons[text or "info"]
    if op == "trend":
        v, eps = float(value), float(knobs["eps"])
        if not math.isfinite(v) or abs(v) <= eps:
            return None
        return "up" if v > 0 else "down"
    if op == "afford":
        return "ok" if float(value) <= float(have) else "fail"
    if op == "balance":
        return "warn" if float(value) < 0 else None
    if op == "with":
        return f"{icons[text.split(':', 1)[0]]} {text.split(':', 1)[1]}" if text else text
    raise ValueError(f"unknown op {op}")

HOLON = Holon(
    id='ui.panels.stats',
    rung=3,
    title='Stat chips and status marks',
    purpose="The top bar's stat chips and the status marks: a shape, a word and a colour for ok, fail, warn, growing, up, down and info.",
    requires=['statusIcon gives the mark for a kind: ok ✓, fail ✗, warn !, growing ◔, up ▲, down ▼, info i (status-icon.ts).', 'trendKind is up or down when a change is beyond eps, else null (status-icon.ts:16).'],
    files=['src/ui/stat-chips.ts', 'src/ui/StatChips.tsx', 'src/ui/status-icon.ts', 'src/game/golf/topstats.ts'],
    dynamics=[
        Fn(name='statusIcon', at='src/ui/status-icon.ts:13', does="a kind's mark", sig='(k: StatusKind) => string'),
        Fn(name='trendKind', at='src/ui/status-icon.ts:16', does='up, down or null', sig="(delta, eps?) => 'up' | 'down' | null"),
        Fn(name='statChips', at='src/ui/stat-chips.ts:48', does="the top bar's chips", sig='(s: TopStats, debtLeft?) => StatChipView[]'),
        Fn(name='StatChips', at='src/ui/StatChips.tsx:36', does='the chips row', sig='({chips, on, drawer}) => JSX')],
    inputs=['the top stats; a change'],
    outputs=['chip views; marks'],
    tests=['ui-stat-chips.test.ts', 'not-by-colour.test.ts', 'ui-club-card.test.ts'],
    below=['business'],
    above=['ui.rail'],
    dual='derived from the stats each frame',
    rules=['no flat colour washes'],
    impl='native',
    params={'op': 'trend | afford | balance | with | icon', 'value': 'a number or text', 'knobs': 'steer values'},
    steer={'icons': {'ok': '✓', 'fail': '✗', 'warn': '!', 'growing': '◔', 'up': '▲', 'down': '▼', 'info': 'i'}, 'eps': 0},
    fn=status_check,
)
