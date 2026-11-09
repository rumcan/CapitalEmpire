"""play.rounds.field: Field and tee times. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.rounds.field.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.rounds.field', rung=3, title='Field and tee times',
    purpose="A tournament's golfers and their tee times, seeded.",
    requires=['makeField is seeded by the tier and the seed (golf/play/field.ts:29).'],
    files=['src/game/golf/play/field.ts'],
    dynamics=[Fn(name='makeField', at='src/game/golf/play/field.ts:29', does='the golfers of a tournament field', sig='(tier, seed)'),
        Fn(name='teeTimes', at='src/game/golf/play/field.ts:52', does='the groups and their tee times', sig='(golfers, seed)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play.test.ts', 'tests/golf-play-pace.test.ts'],
    below=[], above=[], dual='none: derived from the seed',
    seams=['Golfer', 'Group (types.ts)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port makeField and teeTimes (golf/play/field.ts:29, :52)',
)
