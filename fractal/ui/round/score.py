"""ui.round.score: The round bar, score card and matches (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.round.score',
    rung=3,
    title='The round bar, score card and matches',
    purpose='The round bar with its hole choice, the score card, and the match cards for a challenge.',
    requires=['The round bar and the score card read the live round (YourRound.tsx).', 'A challenge box offers a match and a result card shows it after (MatchCards.tsx).'],
    files=['src/ui/golf/YourRound.tsx', 'src/ui/golf/MatchCards.tsx'],
    dynamics=[
        Fn(name='RoundBar', at='src/ui/golf/YourRound.tsx:57', does='the round bar', sig='({v, onJump, onCart, ...}) => JSX'),
        Fn(name='ScoreCard', at='src/ui/golf/YourRound.tsx:102', does='the score card', sig='({v, onNext, onDone, onClose}) => JSX'),
        Fn(name='ChallengeBox', at='src/ui/golf/MatchCards.tsx:17', does='the challenge box', sig='({o, onChallenge}) => JSX')],
    inputs=['the round view and the match offer'],
    outputs=["the round's clicks"],
    tests=['golf-clubevents.test.ts', 'golf-gimme.test.ts', 'golf-match.test.ts', 'ui-start-round.test.ts', 'ui-cards-card.test.ts'],
    below=['play', 'business'],
    above=['ui.round.shot'],
    dual="derived: the round's own undo is in the play domain",
    rules=['no flat colour washes'],
    impl='describe',
)
