"""ui.cards.collection: Your cards and the vending machine (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='ui.cards.collection',
    rung=3,
    title='Your cards and the vending machine',
    purpose="Your cards card: the 8 slots in play, the collection, the vending machine's pulls, and the stack of cards in the flyouts.",
    requires=['Your cards shows 8 slots in play and every card in the catalogue, the ones you have won in colour (CardsCard header).', 'stackCol places each open card in its column, in STACK_ORDER (card-stack.ts:15).'],
    files=['src/ui/golf/CardsCard.tsx', 'src/ui/golf/CardsHelp.tsx', 'src/ui/golf/CardArt.tsx', 'src/ui/golf/VendingMachine.tsx', 'src/ui/golf/card-stack.ts'],
    dynamics=[
        Fn(name='CardsCard', at='src/ui/golf/CardsCard.tsx:82', does='the cards card', sig='({view, onClose, onEquip, onUnequip, ...}) => JSX'),
        Fn(name='VendingMachine', at='src/ui/golf/VendingMachine.tsx:99', does='the vending machine', sig='({v, onSpin, onSettle, ...}) => JSX'),
        Fn(name='stackCol', at='src/ui/golf/card-stack.ts:15', does='the column of an open card', sig='(open, card) => number')],
    inputs=['the cards view; the open stack'],
    outputs=['the equip and unequip clicks; the column'],
    tests=['ui-cards-card.test.ts', 'ui-cards-help.test.ts', 'ui-card-stack.test.ts', 'golf-cards.test.ts'],
    below=['play', 'business'],
    above=['ui.cards.bag'],
    dual='Unequip takes a card out of its slot (CardsCard onUnequip)',
    rules=['new art used everywhere'],
    impl='native',
    steer={'stack_order': ['main', 'staff', 'player', 'bag']},
    port='todo: port stackCol (card-stack.ts:15) and stackFit (:28); RIGHT (the column x list) is in card-stack.ts',
    fn=ported,
)
