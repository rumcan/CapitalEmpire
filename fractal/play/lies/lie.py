"""play.lies.lie: Lie and slope. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.lies.lie.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.lies.lie', rung=3, title='Lie and slope',
    purpose="The finer lie kind for a surface, the flier chance per club and the slope's effect.",
    requires=['flierChance is at most 1 (golf/play/lies.ts:72).', 'A golf surface maps to a finer lie kind (golf/play/lies.ts:24).'],
    files=['src/game/golf/play/lies.ts'],
    dynamics=[Fn(name='lieKindOfSurface', at='src/game/golf/play/lies.ts:24', does='the finer lie kind of a golf surface', sig='(s)'),
        Fn(name='flierChance', at='src/game/golf/play/lies.ts:72', does='the chance a ball flies out of this lie with this club', sig='(k, club)'),
        Fn(name='slopeEffect', at='src/game/golf/play/lies.ts:98', does="the slope's effect on a shot", sig='(s)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-conditions.test.ts', 'tests/golf-play-course.test.ts'],
    below=[], above=[], dual='none: derived from the surface and the lie each time',
    seams=['GolfSurface from the course grid'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port lieKindOfSurface, flierChance, slopeEffect (golf/play/lies.ts:24, :72, :98); needs LIE_FX and FLIER_CLUB (lies.ts 1-23)',
)
