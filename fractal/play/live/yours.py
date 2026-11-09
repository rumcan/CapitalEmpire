"""play.live.yours: Your card. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.live.yours.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.live.yours', rung=3, title='Your card',
    purpose='Your round by hand: the card, the mulligans, the gimmes, the match-free totals and the hole rules.',
    requires=['canMulligan is true only while a mulligan is left (golf/play/yours.ts:211).', "cardTotals sums the card's strokes, par and putts (golf/play/yours.ts:248)."],
    files=['src/game/golf/play/yours.ts'],
    dynamics=[Fn(name='startRound', at='src/game/golf/play/yours.ts:123', does='starts your card on the holes you chose', sig='(view, holes, day, rules)'),
        Fn(name='playYours', at='src/game/golf/play/yours.ts:159', does='plays your shot from the input', sig='(view, r, sk, input)'),
        Fn(name='takeMulligan', at='src/game/golf/play/yours.ts:214', does='takes a shot back with a mulligan', sig='(r)'),
        Fn(name='takeGimme', at='src/game/golf/play/yours.ts:239', does='takes a gimme on the putt', sig='(view, r)')],
    inputs=[], outputs=[],
    tests=['tests/golf-yours.test.ts', 'tests/golf-mulligan.test.ts', 'tests/golf-gimme.test.ts'],
    below=[], above=[], dual='takeMulligan (golf/play/yours.ts:214) takes the shot back',
    seams=['YourRound in GolfSave'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port startRound, playYours and takeMulligan (golf/play/yours.ts:123, :159, :214)',
)
