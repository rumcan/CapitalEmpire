"""business.biz.catalogue: Business catalogue and stats. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.biz.catalogue.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.biz.catalogue', rung=3, title='Business catalogue and stats',
    purpose='The business types, what each costs, earns and needs, the daily demand and the stats it keeps.',
    requires=["A business's unlock is met only by the businesses already owned (src/game/business/catalogue.ts:141)."],
    files=['src/game/business/catalogue.ts', 'src/game/business/state.ts'],
    dynamics=[Fn(name='dailyDemand', at='src/game/business/catalogue.ts:124', does="a business's daily demand for its level and catchment", sig='(type, level, catchment)'),
        Fn(name='satisfactionAfter', at='src/game/business/catalogue.ts:133', does='the satisfaction after a day', sig='(prev, onTime, late, missed)'),
        Fn(name='levelFromXp', at='src/game/business/catalogue.ts:119', does='the level for an xp', sig='(xp)'),
        Fn(name='unlockMet', at='src/game/business/catalogue.ts:141', does='whether an unlock is met by the owned businesses', sig='(u, owned)'),
        Fn(name='freshStats', at='src/game/business/state.ts:14', does="a new business's stats", sig='(id)')],
    inputs=[], outputs=[],
    tests=['tests/business-catalogue.test.ts', 'tests/business-city.test.ts', 'tests/business-unknown-type.test.ts'],
    below=[], above=[], dual='none in this module: placed businesses are removed by the City (not mapped here)',
    seams=['BusinessDef', 'BizStats'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port dailyDemand, satisfactionAfter and levelFromXp (business/catalogue.ts:124, :133, :119)',
)
