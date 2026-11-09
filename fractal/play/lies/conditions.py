"""play.lies.conditions: Shot conditions. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.lies.conditions.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.lies.conditions', rung=3, title='Shot conditions',
    purpose="A shot's conditions as plain data: the wind, the lie and the slope kept with the shot, and the preview.",
    requires=["A shot's conditions are plain data kept with it; readEnv refuses a value that is not a shot environment (golf/play/conditions.ts:23)."],
    files=['src/game/golf/play/conditions.ts'],
    dynamics=[Fn(name='previewShot', at='src/game/golf/play/conditions.ts:62', does="the preview of a shot's carry under its conditions", sig='(club, aimedM, ux, uy, env, shape=None)'),
        Fn(name='envOf', at='src/game/golf/play/conditions.ts:36', does="a shot's environment from the wind, lie and slope", sig='(wind, kindAt, height, ball, ...)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-conditions.test.ts'],
    below=[], above=[], dual="none: the conditions are read from the shot's saved input",
    seams=['ShotEnv in the saved input'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port previewShot and envOf (golf/play/conditions.ts:62, :36)',
)
