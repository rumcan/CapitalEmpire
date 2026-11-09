"""play.putting.holed: Holed-out celebration. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.putting.holed.json."""
from fractal.holon import Fn, Holon

STEER = {'min_under_par': 1}

def celebrated(*, strokes: int, par: int, knobs=None) -> bool:
    """a birdie or better: the strokes at most par minus min_under_par (celebrate.ts:15, k <= par - 1)"""
    k = {**STEER, **(knobs or {})}
    return strokes <= par - int(k["min_under_par"])


HOLON = Holon(
    id='play.putting.holed', rung=3, title='Holed-out celebration',
    purpose='A golfer who holes out for a birdie or better celebrates once the ball drops.',
    requires=['A golfer celebrates only after a birdie or better: strokes <= par - 1 (golf/play/celebrate.ts:15).'],
    files=['src/game/golf/play/celebrate.ts'],
    dynamics=[Fn(name='celebrated', at='src/game/golf/play/celebrate.ts:15', does='a birdie or better: strokes at most par minus one', sig='(k, par)'),
        Fn(name='celebrations', at='src/game/golf/play/celebrate.ts:18', does="the celebrations in a round's plan", sig='(plan, view)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-entourage.test.ts'],
    below=[], above=[], dual='none: derived from the plan each time',
    seams=['RoundPlan (golf/play/round.ts)'], rules=[],
    impl='native',
    fn=celebrated, params={}, steer=STEER, port='',
)
