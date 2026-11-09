"""play.putting.green: Green break and cup. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.putting.green.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.putting.green', rung=3, title='Green break and cup',
    purpose="The break grid a green's height gives, the speed a putt needs to drop, and the tracers.",
    requires=["cupFate returns drop, lip or miss from the speed and the offset from the cup's centre (golf/play/green.ts:92).", 'The dot speed rises with the slope: 0.35 + 1.1 x steepShare (golf/play/green.ts:74).'],
    files=['src/game/golf/play/green.ts'],
    dynamics=[Fn(name='cupFate', at='src/game/golf/play/green.ts:92', does="a putt's fate at the cup: drop, lip or miss", sig='(speedMs, offM)'),
        Fn(name='buildBreakGrid', at='src/game/golf/play/green.ts:57', does='the break grid of a green from the height field', sig='(height, onGreen, cx, cy, r)')],
    inputs=[], outputs=[],
    tests=['tests/golf-green.test.ts', 'tests/golf-t333.test.ts', 'tests/golf-play-putting-v2.test.ts'],
    below=[], above=[], dual='takeMulligan (golf/play/yours.ts:214); the break mode and tracers are switches saved in the browser (green.ts:191-200)',
    seams=['HeightAt from the land domain'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port cupFate (golf/play/green.ts:92) and buildBreakGrid (:57); needs CUP_EDGE_M, CAPTURE_MS and the HeightAt field',
)
