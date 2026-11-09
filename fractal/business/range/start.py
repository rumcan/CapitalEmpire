"""business.range.start: Range start on the map. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.range.start.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.range.start', rung=3, title='Range start on the map',
    purpose="A new game's start: one county road crossing the map and the range beside it, on an owned parcel.",
    requires=['A new golf game begins with one county road edge to edge and the range beside it (golf/rangestart.ts header).'],
    files=['src/game/golf/rangestart.ts'],
    dynamics=[Fn(name='planRangeStart', at='src/game/golf/rangestart.ts:251', does='plans the range start from the terrain and the seed', sig='(t, seed)'),
        Fn(name='placeRangeSite', at='src/game/golf/rangestart.ts:240', does="finds the range's site", sig='(t, seed)'),
        Fn(name='regionalRoute', at='src/game/golf/rangestart.ts:151', does='the county road from the edge', sig='(t, J, axis)')],
    inputs=[], outputs=[],
    tests=['tests/golf-rangestart.test.ts', 'tests/golf-rangestart-city.test.ts'],
    below=[], above=[], dual='none: planned from the seed at the start of a game',
    seams=['Terrain (land)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port="todo: port planRangeStart with the terrain generator (golf/rangestart.ts:251; needs land's generate)",
)
