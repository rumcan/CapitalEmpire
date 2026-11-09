"""ui.cards.you: You, your player and the people you meet (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.cards.you',
    rung=3,
    title='You, your player and the people you meet',
    purpose='The you cards: who you are, the talk and tee cards, your player card, and the portrait of a person you click.',
    requires=["A clicked person's portrait is his real look, loaded only when mounted (PersonPortrait.tsx header).", "The player card shows the player's own card (PlayerCard.tsx)."],
    files=['src/ui/golf/YouCards.tsx', 'src/ui/golf/PlayerCard.tsx', 'src/ui/PersonPortrait.tsx'],
    dynamics=[
        Fn(name='WhoCard', at='src/ui/golf/YouCards.tsx:42', does='who you are', sig='({name, look, ...}) => JSX'),
        Fn(name='TalkCard', at='src/ui/golf/YouCards.tsx:106', does='the talk card', sig='({talk, right, onClose, ...}) => JSX'),
        Fn(name='PlayerCard', at='src/ui/golf/PlayerCard.tsx:11', does='the player card', sig='({view, onClose, ...}) => JSX'),
        Fn(name='PersonPortrait', at='src/ui/PersonPortrait.tsx:9', does="a person's portrait", sig='({person, manifest, ...}) => JSX')],
    inputs=['a person; the portrait manifest'],
    outputs=["the portrait picture; the card's clicks"],
    tests=['person-details.test.ts', 'golf-player-cards.test.ts'],
    below=['people.identity', 'play'],
    above=['ui.cards.collection'],
    dual='close the card (onClose)',
    rules=['new art used everywhere'],
    impl='describe',
)
