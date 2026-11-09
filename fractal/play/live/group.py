"""play.live.group: Live group. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.live.group.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.live.group', rung=3, title='Live group',
    purpose="The owner's group played live: the shot outcome for the owner's input, and the group as he plays on.",
    requires=['Advance gives the owner his first turn on hole 0 at his tee time (golf-play-live.test.ts).'],
    files=['src/game/golf/play/live.ts'],
    dynamics=[Fn(name='shotOutcome', at='src/game/golf/play/live.ts:137', does="the outcome of the owner's shot from the input", sig='(view, hole, from, plie, sk, input)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-live.test.ts'],
    below=[], above=[], dual='replay the saved inputs on a fresh plan (golf/play/owner.ts:79 startOwner)',
    seams=['OwnerInput'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port shotOutcome (golf/play/live.ts:137); needs LiveGroup state',
)
