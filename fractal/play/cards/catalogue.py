"""play.cards.catalogue: Card catalogue. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.cards.catalogue.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.cards.catalogue', rung=3, title='Card catalogue',
    purpose='The cards: their names, rarity, mods and the words each card shows.',
    requires=['The catalogue holds 40 to 60 cards with every rarity and mechanic (golf-card-catalogue.test.ts).'],
    files=['src/game/golf/cards/catalogue.ts', 'src/game/golf/cards/index.ts'],
    dynamics=[Fn(name='cardById', at='src/game/golf/cards/catalogue.ts:228', does='a card by its id', sig='(id)'),
        Fn(name='cardLines', at='src/game/golf/cards/catalogue.ts:277', does='the words a card shows', sig='(c)'),
        Fn(name='rarityOf', at='src/game/golf/cards/catalogue.ts:297', does="a card's rarity grade", sig='(c)')],
    inputs=[], outputs=[],
    tests=['tests/golf-card-catalogue.test.ts'],
    below=[], above=[], dual='none: a table',
    seams=['CardDef'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port cardLines, modLines and the CARDS table (golf/cards/catalogue.ts:259, :277); index.ts is re-exports only',
)
