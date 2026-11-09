"""play.rounds.finish: Finish and results. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.rounds.finish.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.rounds.finish', rung=3, title='Finish and results',
    purpose='When the results show: after the last score, and the last-group moment once, before them.',
    requires=['Results come only after the last score; the last-group moment comes once, before them (golf-play-finish.test.ts).'],
    files=['src/game/golf/play/finish.ts'],
    dynamics=[Fn(name='roundOver', at='src/game/golf/play/finish.ts:14', does='whether the round is over at a minute', sig='(plan, view, minute)'),
        Fn(name='lastGroupOnLast', at='src/game/golf/play/finish.ts:41', does='the last group on the 18th, the moment', sig='(plan, view, minute)'),
        Fn(name='resultsDue', at='src/game/golf/play/finish.ts:88', does='whether the results show now', sig='(stage, golf, play, early)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-finish.test.ts'],
    below=[], above=[], dual='none: a gate, not a state',
    seams=["the tournament day's stage (event/round.ts)"], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port resultsDue and roundOver (golf/play/finish.ts:14, :88)',
)
