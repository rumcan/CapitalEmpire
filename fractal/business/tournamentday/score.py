"""business.tournamentday.score: Day scorer. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.tournamentday.score.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.tournamentday.score', rung=3, title='Day scorer',
    purpose='Scores the day from its gate and car park counts: the facts, the satisfaction, the reputation and the money lines.',
    requires=['scoreTournamentDay computes DayFacts, daySatisfaction, reputationAfter and itemized money lines (golf-tournamentday.test.ts).'],
    files=['src/game/golf/tournamentday.ts'],
    dynamics=[Fn(name='scoreTournamentDay', at='src/game/golf/tournamentday.ts:142', does='scores a tournament day', sig='(input)'),
        Fn(name='scoreGateFlow', at='src/game/golf/tournamentday.ts:118', does='classifies on-time and late arrivals by the gate', sig='(g, express=False)'),
        Fn(name='percentile95', at='src/game/golf/tournamentday.ts:110', does='the 95th percentile of waits', sig='(values, fallback=30)')],
    inputs=[], outputs=[],
    tests=['tests/golf-tournamentday.test.ts'],
    below=[], above=[], dual="none: a pure scorer of the day's facts",
    seams=['DayFacts'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port scoreTournamentDay, scoreGateFlow and percentile95 (golf/tournamentday.ts:110, :118, :142)',
)
