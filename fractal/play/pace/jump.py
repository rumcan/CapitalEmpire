"""play.pace.jump: Your step and puffs. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.pace.jump.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.pace.jump', rung=3, title='Your step and puffs',
    purpose='The walk up to your ball (no teleport) and the puffs of a jump.',
    requires=['The walk up: near your ball you walk the last steps to the address, no teleport (golf/play/jumpfx.ts header).'],
    files=['src/game/golf/play/jumpfx.ts'],
    dynamics=[Fn(name='stepToward', at='src/game/golf/play/jumpfx.ts:19', does='one step toward a point', sig='(p, to, step)'),
        Fn(name='jumpAlpha', at='src/game/golf/play/jumpfx.ts:26', does="the jump's fade by age", sig='(age)'),
        Fn(name='livePuffs', at='src/game/golf/play/jumpfx.ts:45', does='the puffs still alive', sig='(puffs, now)')],
    inputs=[], outputs=[],
    tests=['tests/golf-t333.test.ts'],
    below=[], above=[], dual='none: a step and a fade',
    seams=["the owner's position"], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port stepToward, jumpAlpha, puffAt (golf/play/jumpfx.ts:19, :26, :32)',
)
