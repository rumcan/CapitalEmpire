"""business.tournaments.multiday: Multi-day tournament. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.tournaments.multiday.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.tournaments.multiday', rung=3, title='Multi-day tournament',
    purpose='A tournament over several days: the practice days, the live days and the weather they resolve with.',
    requires=['resolveMultiDayTournament resolves the days of a tournament from its input (golf/multiday.ts:166).'],
    files=['src/game/golf/multiday.ts'],
    dynamics=[Fn(name='resolveMultiDayTournament', at='src/game/golf/multiday.ts:166', does='resolves a multi-day tournament', sig='(input)'),
        Fn(name='resolveMultiDayWithPractice', at='src/game/golf/multiday.ts:150', does='resolves with its practice days', sig='(input)')],
    inputs=[], outputs=[],
    tests=['tests/golf-multiday.test.ts', 'tests/golf-practicedays.test.ts'],
    below=[], above=[], dual='none: resolved from the input',
    seams=['ResolveMultiDayInput'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port resolveMultiDayTournament (golf/multiday.ts:166)',
)
