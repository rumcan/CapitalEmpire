"""play.live.owner: Owner's clubs and power. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.live.owner.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.live.owner', rung=3, title="Owner's clubs and power",
    purpose="The owner's golfer, the clubs he may take from a lie and the power a club starts at.",
    requires=["The owner's live group starts from a fresh plan by a replay of his saved inputs (golf/play/owner.ts:79)."],
    files=['src/game/golf/play/owner.ts'],
    dynamics=[Fn(name='allowedClubs', at='src/game/golf/play/owner.ts:36', does='the clubs he may take from a lie', sig='(lie, teeShot, bag=None, mech=None)'),
        Fn(name='powerFor', at='src/game/golf/play/owner.ts:48', does='the power a club starts at for a distance', sig='(club, distM, skill)'),
        Fn(name='startOwner', at='src/game/golf/play/owner.ts:79', does='starts his live group from a fresh plan and his saved inputs', sig='(plan, view, groupIdx, seed, inputs, ...)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-owner.test.ts'],
    below=[], above=[], dual='startOwner (golf/play/owner.ts:79) rebuilds the group from the saved inputs',
    seams=['DayOwner'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port allowedClubs and powerFor (golf/play/owner.ts:36, :48)',
)
