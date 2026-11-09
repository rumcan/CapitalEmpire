"""people.galleries.draw: Fans per gallery and their moves (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='people.galleries.draw',
    rung=3,
    title='Fans per gallery and their moves',
    purpose='How many fans each gallery draws at a game minute, and which fans move between spots every 30 minutes.',
    requires=['Featured holes draw FEATURED_BUMP 2 more; the last green draws more from minute 870 (gallerydraw.ts:11 to :15).', 'Fans relocate every RELOCATE_EVERY 30 game minutes, a quarter of them at most (RELOCATE_SHARE 0.25).'],
    files=['src/game/golf/gallerydraw.ts'],
    dynamics=[
        Fn(name='spotDraw', at='src/game/golf/gallerydraw.ts:28', does='how many fans a spot draws at a minute', sig='(s, m, holes, featured?) => number'),
        Fn(name='fairShares', at='src/game/golf/gallerydraw.ts:40', does='splits the fans among the spots', sig='(spots, m, holes, total, featured?) => number[]'),
        Fn(name='relocate', at='src/game/golf/gallerydraw.ts:51', does='the fans who move between spots', sig='(spots, fill, m, holes, featured?) => Move[]')],
    inputs=['the spots, a game minute, the holes'],
    outputs=['fans per spot; a Move list'],
    tests=['golf-gallerydraw.test.ts'],
    below=['people.galleries.spots'],
    above=['people.crowd.view', 'business'],
    dual='derived each minute; nothing to undo',
    rules=['performance is a hard gate'],
    impl='native',
    steer={'featured_bump': 2, 'last_green_from': 870, 'last_green_pm': 2, 'relocate_every': 30, 'relocate_share': 0.25},
    port='todo: port spotDraw (gallerydraw.ts:28), fairShares (:40) and relocate (:51) on the steer values',
    fn=ported,
)
