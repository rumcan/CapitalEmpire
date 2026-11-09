"""play.ai.match: Money match. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.ai.match.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.ai.match', rung=3, title='Money match',
    purpose="The money match against a person: the opponent's answer, the hole outcomes, the score and the settlement.",
    requires=['Match play: a hole is decided once neither side can do better (golf-match.test.ts).', "The opponent's answer is deterministic and never past their purse (golf-match.test.ts)."],
    files=['src/game/golf/play/match.ts'],
    dynamics=[Fn(name='answerOf', at='src/game/golf/play/match.ts:112', does="the opponent's answer to a stake", sig='(o, yourHcp, stake, holes, rival, ...)'),
        Fn(name='holeOutcome', at='src/game/golf/play/match.ts:155', does='who won a hole', sig='(you, opp)'),
        Fn(name='settleMatch', at='src/game/golf/play/match.ts:254', does='settles the money match into the profile', sig='(p, r, conceded=False)')],
    inputs=[], outputs=[],
    tests=['tests/golf-match.test.ts', 'tests/golf-everyday-weather.test.ts'],
    below=[], above=[], dual='MISSING: a settled money match cannot be undone; settleMatch (golf/play/match.ts:254) moves the purse at once',
    seams=['Opponent, Rival, MatchPlay'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port answerOf, holeOutcome and settleMatch (golf/play/match.ts:112, :155, :254)',
)
