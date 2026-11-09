"""people.crowd.walkers: Crowd walkers (lot stops, gates, buses) (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='people.crowd.walkers',
    rung=3,
    title='Crowd walkers (lot stops, gates, buses)',
    purpose="The shuttle round's walkers, the queues at each lot stop and gate, the fans on each bus, and the crowd's save.",
    requires=["The walker cap is 6000 and a walker's stride is 7 buffer floats (event/crowd.ts:33 and :35).", 'Crowd.save and Crowd.load carry the queues, the buses and the walkers across a save.'],
    files=['src/game/event/crowd.ts', 'src/game/golf/walkfield.ts', 'src/game/golf/walkground.ts'],
    dynamics=[
        Fn(name='Crowd', at='src/game/event/crowd.ts:38', does='the crowd of one shuttle round', sig='class Crowd'),
        Fn(name='admit', at='src/game/event/crowd.ts:88', does='admits a party at a gate', sig='(g, n, x, y) => number'),
        Fn(name='step', at='src/game/event/crowd.ts:145', does='moves the walkers along by a distance', sig='(dist) => void'),
        Fn(name='save', at='src/game/event/crowd.ts:180', does='the crowd as a save', sig='(routeOf) => CrowdSave'),
        Fn(name='load', at='src/game/event/crowd.ts:193', does='restores the crowd from a save', sig='(s) => void')],
    inputs=["the round's towns, routes and gates"],
    outputs=['FanCounts; the walkers; a CrowdSave'],
    tests=['crowdview.test.ts', 'gates.test.ts', 'results-measured.test.ts', 't377-city-crowd.test.ts', 'event.test.ts'],
    below=['people.animation', 'play'],
    above=['people.crowd.view', 'business'],
    dual="Crowd.save and Crowd.load restore a round's crowd; the round itself is derived",
    seams=['the shuttle round (event/round.ts)'],
    rules=["town jams are the player's job", 'performance is a hard gate'],
    impl='native',
    steer={'walk_cap': 6000, 'walk_stride': 7},
    port='todo: port the Crowd class (event/crowd.ts:38): admit (:88), board (:101), step (:145), counts (:171), save (:180), load (:193)',
    fn=ported,
)
