"""business.biz.visits: Business visits. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.biz.visits.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.biz.visits', rung=3, title='Business visits',
    purpose="Each visit business's day as cars: the day's demand becomes departures from the towns' homes.",
    requires=["Each visit business's day becomes departures from the homes at plan time (src/game/business/visits.ts header)."],
    files=['src/game/business/visits.ts'],
    dynamics=[Fn(name='Visits', at='src/game/business/visits.ts:40', does="the visits class: plans a day's departures and counts on-time and late visits", sig='class')],
    inputs=[], outputs=[],
    tests=['tests/business-visits.test.ts', 'tests/golf-rangestart-city.test.ts'],
    below=[], above=[], dual="none: a day's plan",
    seams=['VisitBiz', 'Dep (departures)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port the Visits class (business/visits.ts:40)',
)
