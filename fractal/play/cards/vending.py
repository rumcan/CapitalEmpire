"""play.cards.vending: Vending machine. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.cards.vending.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.cards.vending', rung=3, title='Vending machine',
    purpose="The machine's odds and reel: the prize kinds, the dud share and the odds rows by grade.",
    requires=["The odds view is the machine's own odds for the owned cards and the grade (golf/cards/vending.ts:66)."],
    files=['src/game/golf/cards/vending.ts'],
    dynamics=[Fn(name='oddsView', at='src/game/golf/cards/vending.ts:66', does='the odds rows and the dud share for a grade', sig='(owned, grade)'),
        Fn(name='rollPrize', at='src/game/golf/cards/vending.ts:45', does='rolls one prize from the owned set and the grade', sig='(owned, grade, random)')],
    inputs=[], outputs=[],
    tests=['tests/golf-player-cards.test.ts', 'tests/golf-card-catalogue.test.ts'],
    below=[], above=[], dual='MISSING: a rolled prize cannot be undone; takePull (golf/cards/collection.ts:104) spends the pull before the roll',
    seams=['VendingSpin'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port rollPrize and oddsView (golf/cards/vending.ts:45, :66); needs the odds tables',
)
