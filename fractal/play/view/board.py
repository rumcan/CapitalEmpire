"""play.view.board: Leaderboard. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.view.board.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.view.board', rung=3, title='Leaderboard',
    purpose='The rows the board shows at a minute, the champion once all are done, and the wait on the group ahead.',
    requires=["The board shows the rows at a minute: position, name, to par, holes thru; the owner's row when he is below the top (golf/play/board.ts header)."],
    files=['src/game/golf/play/board.ts'],
    dynamics=[Fn(name='boardRows', at='src/game/golf/play/board.ts:21', does="the board's rows at a minute", sig='(standings, golfers, limit, ownerId)'),
        Fn(name='champion', at='src/game/golf/play/board.ts:35', does='the champion once everyone is done', sig='(plan, view, minute)'),
        Fn(name='waitText', at='src/game/golf/play/board.ts:72', does='the wait on the group ahead as text', sig='(plan, view, golfer, minute)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-board.test.ts'],
    below=[], above=[], dual='none: derived each time',
    seams=['BoardRow'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port boardRows and champion (golf/play/board.ts:21, :35)',
)
