"""business.facilities.placing: Placing an upgrade. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.facilities.placing.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.facilities.placing', rung=3, title='Placing an upgrade',
    purpose='The rule for placing a bought upgrade: whether a placement is allowed and why, given the money.',
    requires=['placeVerdict says whether a placeable upgrade may go where it is and why, given the money (golf/placing.ts:24).'],
    files=['src/game/golf/placing.ts', 'src/game/golf/structure-facing.ts'],
    dynamics=[Fn(name='placeVerdict', at='src/game/golf/placing.ts:24', does='whether a placement is allowed, and the label', sig='(p, s, money)'),
        Fn(name='landWhy', at='src/game/golf/placing.ts:76', does='why a rectangle of land fails', sig='(r, c)'),
        Fn(name='rangeSpotAt', at='src/game/golf/placing.ts:55', does='the range spot at a point on the home plot', sig='(home, facing, x, y)')],
    inputs=[], outputs=[],
    tests=['tests/golf-range-seeds.test.ts', 'tests/t288-place-what-you-buy.test.ts'],
    below=[], above=[], dual='none: a verdict',
    seams=['Placeable'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port landWhy and placeVerdict (golf/placing.ts:76, :24)',
)
