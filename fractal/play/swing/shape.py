"""play.swing.shape: Shot shape. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.swing.shape.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.swing.shape', rung=3, title='Shot shape',
    purpose='The pick (draw, straight, fade; low, normal, high) and what it does to the curve, the flight and the miss.',
    requires=['A draw curves left and runs on; a fade curves right and checks; more of it on longer shots and better golfers (golf-play-shaping.test.ts).', 'Each pick makes the miss bigger: curve x1.35, flight x1.2, both x1.55 (golf-play-shaping.test.ts).'],
    files=['src/game/golf/play/shape.ts'],
    dynamics=[Fn(name='shapeEffect', at='src/game/golf/play/shape.ts:38', does="the shape's curve, flight and miss effects for a club and carry", sig='(shape, club, carryM, skill, kit=None)'),
        Fn(name='readShape', at='src/game/golf/play/shape.ts:25', does='reads a saved shape; junk is none', sig='(v)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-shaping.test.ts'],
    below=[], above=[], dual='the pick is made again before the swing opens; after it, takeMulligan (golf/play/yours.ts:214)',
    seams=['ShotShape in the saved input'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port shapeEffect (golf/play/shape.ts:38) with the ShapeFx table (shape.ts 1-24)',
)
