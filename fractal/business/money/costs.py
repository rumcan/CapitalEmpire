"""business.money.costs: Build and upkeep costs. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.money.costs.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.money.costs', rung=3, title='Build and upkeep costs',
    purpose='What a golf surface costs to build (seed or sod), how long it takes to grow in, and its monthly upkeep.',
    requires=["A surface's build cost is its area times its unit cost, by seed or sod (src/game/golf/costs.ts:65-76)."],
    files=['src/game/golf/costs.ts'],
    dynamics=[Fn(name='areaBuildCost', at='src/game/golf/costs.ts:76', does='the build cost of an area', sig='(pts, surfaceOrTex, kind)'),
        Fn(name='courseMonthlyUpkeep', at='src/game/golf/costs.ts:104', does="the course's monthly upkeep", sig='(areas)'),
        Fn(name='growInMonths', at='src/game/golf/costs.ts:82', does='months to grow in', sig='(surface, kind)')],
    inputs=[], outputs=[],
    tests=['tests/golf-costs.test.ts', 'tests/golf-growin.test.ts'],
    below=[], above=[], dual='MISSING: no refund for a built surface; areaBuildCost (golf/costs.ts:76) only prices a new area',
    seams=['GolfSurface'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port unitBuildCost and areaBuildCost (golf/costs.ts:65, :76) with SURFACE_COST (costs.ts 1-45)',
)
