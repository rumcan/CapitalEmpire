"""play.cards.earning: How a pull is earned. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.cards.earning.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.cards.earning', rung=3, title='How a pull is earned',
    purpose='A tournament win earns a card pull; a finished place earns one by its place.',
    requires=['A tournament win earns a card pull (golf/cards/earning.ts header; golf-welcome-pull.test.ts).'],
    files=['src/game/golf/cards/earning.ts'],
    dynamics=[Fn(name='earnFromPlace', at='src/game/golf/cards/earning.ts:25', does='the pull a finishing place earns', sig='(pos, of, what)'),
        Fn(name='earnFromMatch', at='src/game/golf/cards/earning.ts:33', does='the pull a money match earns', sig='(result, stake)')],
    inputs=[], outputs=[],
    tests=['tests/golf-welcome-pull.test.ts', 'tests/golf-player-cards.test.ts'],
    below=[], above=[], dual='MISSING: an earned pull cannot be given back; takePull (golf/cards/collection.ts:104) only spends one',
    seams=['Earn'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port earnFromPlace and earnFromMatch (golf/cards/earning.ts:25, :33)',
)
