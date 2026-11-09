"""play.pace.carts: Cart routes. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.pace.carts.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.pace.carts', rung=3, title='Cart routes',
    purpose='The cart paths and the routes a cart drives: along the paths, else around the played surfaces.',
    requires=['Carts park by the tee and beside the green on the path, never on a green (golf-play-entourage.test.ts).', "The routes run along the paths, else around the played surfaces at the rough's edge (golf-play-entourage.test.ts)."],
    files=['src/game/golf/play/carts.ts'],
    dynamics=[Fn(name='cartPaths', at='src/game/golf/play/carts.ts:56', does='the cart paths from the lines', sig='(lines)'),
        Fn(name='pathRoute', at='src/game/golf/play/carts.ts:86', does='the route between two points along the paths', sig='(P, a, b)'),
        Fn(name='nearestOnPaths', at='src/game/golf/play/carts.ts:74', does='the nearest point on a path', sig='(P, x, y)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-entourage.test.ts'],
    below=[], above=[], dual='none: routes are recomputed',
    seams=['CartPaths'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port cartPaths, pathRoute, nearestOnPaths (golf/play/carts.ts:56, :74, :86)',
)
