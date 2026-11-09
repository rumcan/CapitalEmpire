"""play.cards.collection: Collection and slots. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.cards.collection.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.cards.collection', rung=3, title='Collection and slots',
    purpose='Owning cards, the 8 slots, equipping and unequipping, and the effects the equipped cards give.',
    requires=['equipCard puts a card in a slot and unequipCard frees it (golf/cards/collection.ts:77, :90).', 'addCard reports isNew: a card is owned once (golf/cards/collection.ts:97).'],
    files=['src/game/golf/cards/collection.ts'],
    dynamics=[Fn(name='equipCard', at='src/game/golf/cards/collection.ts:77', does='puts a card in a slot', sig='(c, id, slot)'),
        Fn(name='unequipCard', at='src/game/golf/cards/collection.ts:90', does='frees a slot', sig='(c, slot)'),
        Fn(name='addCard', at='src/game/golf/cards/collection.ts:97', does='owns a card; isNew says it was not owned before', sig='(c, id)'),
        Fn(name='cardEffects', at='src/game/golf/cards/collection.ts:120', does='the effects of the equipped cards', sig='(c, competition=False)')],
    inputs=[], outputs=[],
    tests=['tests/golf-player-cards.test.ts', 'tests/golf-card-catalogue.test.ts'],
    below=[], above=[], dual='unequipCard (golf/cards/collection.ts:90) frees the slot',
    seams=['CardsSave in GolfSave'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port equipCard, unequipCard, addCard and cardEffects (golf/cards/collection.ts 77-147)',
)
