"""play.swing.spin: Spin control. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.swing.spin.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.swing.spin', rung=3, title='Spin control',
    purpose='The spin dot and clicks: how much backspin or topspin and side spin a shot takes.',
    requires=["The dot gives up to SPIN.base and each click in the air SPIN.per more, up to the club's cap (golf-play-spin.test.ts).", 'The rough and the fescue cut spin; the tee and the fairway do not (golf-play-spin.test.ts).', 'A putt keeps no spin (golf-play-spin.test.ts).'],
    files=['src/game/golf/play/spin.ts'],
    dynamics=[Fn(name='spinEffect', at='src/game/golf/play/spin.ts:60', does="the spin's effect on carry, roll and side for a club and lie", sig='(s, club, lie, kind=None, k=1)'),
        Fn(name='spinCap', at='src/game/golf/play/spin.ts:50', does='the most spin a club can take from a lie', sig='(club, lie, _ux, uy, kind=None, k=1)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-spin.test.ts'],
    below=[], above=[], dual='takeMulligan (golf/play/yours.ts:214)',
    seams=['SpinInput in the saved input'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port spinCap and spinEffect (golf/play/spin.ts:50, :60) with SPIN and CURVE_K (spin.ts 1-37)',
)
