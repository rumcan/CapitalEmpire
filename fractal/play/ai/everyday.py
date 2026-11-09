"""play.ai.everyday: Everyday tee sheet. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.ai.everyday.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.ai.everyday', rung=3, title='Everyday tee sheet',
    purpose="The everyday club's day: the roster of members and visitors, and the check-ins.",
    requires=["The day's roster is seeded from the seed and the day (golf/everyday.ts:72, daySeed)."],
    files=['src/game/golf/everyday.ts'],
    dynamics=[Fn(name='dayRoster', at='src/game/golf/everyday.ts:97', does="the day's tee sheet from the seed and the day", sig='(seed, day, inp)'),
        Fn(name='daySeed', at='src/game/golf/everyday.ts:72', does="the day's seed", sig='(seed, day)'),
        Fn(name='checkInsTo', at='src/game/golf/everyday.ts:158', does='the check-ins up to a minute', sig='(roster, paid, m)')],
    inputs=[], outputs=[],
    tests=['tests/golf-everyday.test.ts', 'tests/golf-everyday-continuity.test.ts'],
    below=[], above=[], dual='none: the roster is recomputed from the seed and the day',
    seams=['DayInputs', 'DayRoster'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port dayRoster and daySeed (golf/everyday.ts:97, :72)',
)
