"""play.pace.yourcart: Your cart. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.pace.yourcart.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.pace.yourcart', rung=3, title='Your cart',
    purpose='Your golf cart: calling it, where it appears and where it parks.',
    requires=['A call: a cart near you waits, within the drive distance it drives, farther it appears nearer first (golf-yourcart.test.ts).', 'The call spot skips ground the cart may not stand on (golf-yourcart.test.ts).'],
    files=['src/game/golf/play/yourcart.ts'],
    dynamics=[Fn(name='callMode', at='src/game/golf/play/yourcart.ts:31', does='wait, drive or appear, for a distance', sig='(d, reach)'),
        Fn(name='callSpot', at='src/game/golf/play/yourcart.ts:37', does='the spot the cart comes to', sig='(you, from, ok)'),
        Fn(name='parkSpot', at='src/game/golf/play/yourcart.ts:69', does='where the cart parks', sig='(at, ok, surf, greenNear)')],
    inputs=[], outputs=[],
    tests=['tests/golf-yourcart.test.ts'],
    below=[], above=[], dual='parkSpot (golf/play/yourcart.ts:69) parks it again',
    seams=["the cart's state"], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port callMode and callSpot (golf/play/yourcart.ts:31, :37); needs CALL_DRIVE and APPEAR_TILES',
)
