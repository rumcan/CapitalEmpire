"""business.range.economy: Range economy. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.range.economy.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.range.economy', rung=3, title='Range economy',
    purpose="The range's save, upgrades, price and demand: the day's visitors and the money they bring.",
    requires=['A new range has 4 bays, $6 and nothing bought (golf-rangebiz.test.ts).', 'The demand falls with the price and is zero when closed (golf-rangebiz.test.ts).'],
    files=['src/game/golf/rangesave.ts'],
    dynamics=[Fn(name='dayDemand', at='src/game/golf/rangesave.ts:352', does="the day's demand for the range", sig='(s, c, st)'),
        Fn(name='rangeStats', at='src/game/golf/rangesave.ts:268', does="the range's stats from its save", sig='(s, x)'),
        Fn(name='withUpgrade', at='src/game/golf/rangesave.ts:338', does='adds an upgrade to the save', sig='(s, id)'),
        Fn(name='rangeUpkeep', at='src/game/golf/rangesave.ts:173', does='the upkeep of the owned upgrades', sig='(s)')],
    inputs=[], outputs=[],
    tests=['tests/golf-rangebiz.test.ts', 'tests/golf-range-tree.test.ts', 'tests/golf-range-pacing.test.ts'],
    below=[], above=[], dual='MISSING: an upgrade cannot be sold back; withUpgrade (golf/rangesave.ts:338) only adds one',
    seams=['RangeBizSave in GolfSave'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port dayDemand and rangeStats (golf/rangesave.ts:352, :268); the demand constants are in rangesave.ts 1-166',
)
