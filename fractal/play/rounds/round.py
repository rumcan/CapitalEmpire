"""play.rounds.round: The day's round. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.rounds.round.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.rounds.round', rung=3, title="The day's round",
    purpose='The whole day played at the start, group by group, and the state of each golfer at a game minute.',
    requires=['The whole day is played at the start, group by group and hole by hole (golf/play/round.ts header).', "stateAt gives each golfer's state at a game minute, for the playback (golf/play/round.ts:512)."],
    files=['src/game/golf/play/round.ts'],
    dynamics=[Fn(name='playRound', at='src/game/golf/play/round.ts:318', does='plays the whole day from the field, the groups and the seed', sig='(view, golfers, groups, seed, opts)'),
        Fn(name='stateAt', at='src/game/golf/play/round.ts:512', does="each golfer's state at a game minute", sig='(plan, view, minute, out=None)'),
        Fn(name='standings', at='src/game/golf/play/round.ts:525', does='the standings at a game minute', sig='(plan, view, minute)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play.test.ts', 'tests/golf-play-pace.test.ts', 'tests/golf-yours.test.ts'],
    below=[], above=[], dual='none: re-played from the seed and the inputs',
    seams=['RoundPlan', 'Shot (types.ts)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port playRound, stateAt and standings (golf/play/round.ts:318, :512, :525); the largest module (535 lines)',
)
