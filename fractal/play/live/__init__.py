"""play.live: Your round, played by hand (T410). Your own round: the owner's live group, your card with mulligans and gimmes, the practice holes and the start-round clock."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.live', rung=2, title='Your round, played by hand',
    purpose="Your own round: the owner's live group, your card with mulligans and gimmes, the practice holes and the start-round clock.",
    requires=["playRound with live plays the day up to the owner's first strike and no further (golf-play-live.test.ts).", 'canMulligan is true only while a mulligan is left (golf/play/yours.ts:211).'],
    below=['course', 'ui'], above=['ui', 'people'],
    dual=None, rules=[],
)
