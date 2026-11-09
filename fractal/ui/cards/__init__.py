"""ui.cards: Cards, the bag and the people you meet (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.cards',
    rung=2,
    title='Cards, the bag and the people you meet',
    purpose='Your collection and its slots, the bag and ball room, and the people you meet on the course.',
    requires=['Your cards show 8 slots in play and the collection (CardsCard header).', "A clicked person's portrait is his real look, loaded only when mounted (PersonPortrait header)."],
    below=['play', 'business', 'people'],
    above=['ui.round'],
    dual='Unequip takes a card out of its slot (CardsCard onUnequip)',
    rules=['new art used everywhere'],
)
