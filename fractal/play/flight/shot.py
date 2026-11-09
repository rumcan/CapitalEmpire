"""play.flight.shot: Full shot and putt. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.flight.shot.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.flight.shot', rung=3, title='Full shot and putt',
    purpose='A full shot or chip from its lie: where it lands, the lie there and where it rolls to; a putt is holed or leaves metres.',
    requires=["carryM is the club's length times (0.65 + 0.35 x skill) (golf/play/shot.ts:63).", 'putt() returns holed or the metres left (golf/play/shot.ts:203).'],
    files=['src/game/golf/play/shot.ts'],
    dynamics=[Fn(name='hitShot', at='src/game/golf/play/shot.ts:144', does='a full shot or chip from its lie: landing, lie there, roll stop', sig='(r, sk, lie, from, aim, club, view, mod=None)'),
        Fn(name='chooseShot', at='src/game/golf/play/shot.ts:108', does='the club a golfer picks from the lie and distance', sig='(lie, from, hole, skill, teeShot, clubs=None)'),
        Fn(name='putt', at='src/game/golf/play/shot.ts:203', does='a putt: holed, or the metres it leaves', sig='(r, skill, distM, factor=1, v2=False)'),
        Fn(name='carryM', at='src/game/golf/play/shot.ts:63', does='carry in metres for a club and skill', sig='(club, skill)')],
    inputs=[], outputs=[],
    tests=['tests/golf-ball-roll.test.ts', 'tests/golf-play-club-roll.test.ts', 'tests/golf-play-stats.test.ts', 'tests/golf-play-putting-v2.test.ts'],
    below=[], above=[], dual='takeMulligan (golf/play/yours.ts:214); a replay of saved inputs re-makes every shot (golf/play/round.ts)',
    seams=['Landing on Shot (types.ts)', 'rng(seed, a, b) stream (shot.ts:46)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port hitShot (golf/play/shot.ts:144) and chooseShot (:108); needs the Club table CLUBS, LIE_FX and rng (shot.ts 1-62) and the CourseView surface lookup',
)
