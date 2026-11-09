"""play.cards: Your cards (T410). The card collection: the 8 slots, the cards' effects on a shot and on a tournament, the vending machine and the card fold."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.cards', rung=2, title='Your cards',
    purpose="The card collection: the 8 slots, the cards' effects on a shot and on a tournament, the vending machine and the card fold.",
    requires=['The catalogue holds 40 to 60 cards, every rarity and mechanic has a card (golf-card-catalogue.test.ts).', 'You own each card once; the 8 slots hold the equipped ones (golf/cards/collection.ts).'],
    below=['business', 'ui'], above=['ui', 'business'],
    dual=None, rules=[],
)
