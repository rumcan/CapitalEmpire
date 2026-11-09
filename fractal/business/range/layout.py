"""business.range.layout: Range plot and lot. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.range.layout.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.range.layout', rung=3, title='Range plot and lot',
    purpose="The range's plot, its layout by facing, and the lot's ground before it is paved: dirt, then gravel, then asphalt.",
    requires=["A new range's lot is packed dirt, then gravel, then asphalt (golf/rangelot.ts header)."],
    files=['src/game/golf/range.ts', 'src/game/golf/rangelot.ts'],
    dynamics=[Fn(name='rangeLayout', at='src/game/golf/range.ts:62', does="the range's layout for a plot and facing", sig='(plot, facing)'),
        Fn(name='plotOfFront', at='src/game/golf/range.ts:49', does='the plot behind a front', sig='(front, facing)'),
        Fn(name='looseBays', at='src/game/golf/rangelot.ts:28', does='the bays on loose ground, by its share', sig='(bays, ground)')],
    inputs=[], outputs=[],
    tests=['tests/golf-range.test.ts', 'tests/golf-range-guided.test.ts'],
    below=[], above=[], dual='none: derived each time',
    seams=['RangeLayout'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port rangeLayout and looseBays (golf/range.ts:62; golf/rangelot.ts:28); LOT_SHARE is in rangelot.ts:9',
)
