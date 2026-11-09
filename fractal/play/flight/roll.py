"""play.flight.roll: Bounce and roll. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.flight.roll.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.flight.roll', rung=3, title='Bounce and roll',
    purpose='How a landed ball bounces and rolls: higher on the fairway than the green, low in the rough, a dead stop in a bunker, bent by a cross slope.',
    requires=['A ball bounces higher on the fairway than on the green, low in the rough and the fescue, and stops dead in a bunker (golf-ball-roll.test.ts).', 'A cross slope bends the roll without moving its end (golf-ball-roll.test.ts).'],
    files=['src/game/golf/play/roll.ts'],
    dynamics=[Fn(name='crossSlope', at='src/game/golf/play/roll.ts:46', does='the cross slope under the roll, which bends it sideways', sig='(height, x, y, dx, dy, L)')],
    inputs=[], outputs=[],
    tests=['tests/golf-ball-roll.test.ts', 'tests/golf-play-club-roll.test.ts'],
    below=[], above=[], dual='none: a roll is recomputed from the landing and the lie',
    seams=['BOUNCE table (roll.ts:19)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port the roll step and crossSlope (golf/play/roll.ts:46-134); BOUNCE (:19) and BEND (:35) are the numbers',
)
