"""play.lies.wind: The day's wind. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.lies.wind.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.lies.wind', rung=3, title="The day's wind",
    purpose="The day's wind from the seed and the day, gusts, and what the wind does to a shot.",
    requires=["The day's wind is deterministic from the seed and the day (golf-play-conditions.test.ts).", 'A headwind shortens the carry, a tailwind lengthens it a little, a crosswind drifts the ball; a putt takes none (golf-play-conditions.test.ts).'],
    files=['src/game/golf/play/wind.ts'],
    dynamics=[Fn(name='dailyWind', at='src/game/golf/play/wind.ts:41', does="the day's wind from the seed and the day", sig='(seed, day)'),
        Fn(name='windEffect', at='src/game/golf/play/wind.ts:85', does="the wind's tail and cross effect on a shot", sig='(n, club, ux, uy, flight=1)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-conditions.test.ts'],
    below=[], above=[], dual='none: the wind is recomputed from the seed and the day',
    seams=['Wind and WindNow in the save'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port dailyWind, windAt and windEffect (golf/play/wind.ts:41, :58, :85); needs mulberry (src/game/iso) and the POINTS and CALM_MPH constants',
)
