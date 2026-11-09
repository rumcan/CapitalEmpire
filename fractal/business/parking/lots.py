"""business.parking.lots: Car parks and bay rows. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.parking.lots.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.parking.lots', rung=3, title='Car parks and bay rows',
    purpose='A car park beside a road: its frontage, its bays in rows, and what it costs to build.',
    requires=['A bay row lays bays along its front line at 90, 60 or 45 degrees (event/rows.ts header).', "A car park's cost is its area times the lot tile cost (event/carpark.ts:304)."],
    files=['src/game/event/carpark.ts', 'src/game/event/rows.ts', 'src/game/parked-cars.ts', 'src/game/parking-props.ts'],
    dynamics=[Fn(name='buildPark', at='src/game/event/carpark.ts:282', does='builds a car park on the road network', sig='(net, d)'),
        Fn(name='bayGrid', at='src/game/event/carpark.ts:140', does='the bays of a car park along a side', sig='(d, side, entrances)'),
        Fn(name='parkCost', at='src/game/event/carpark.ts:304', does="a car park's cost", sig='(d)'),
        Fn(name='rowBays', at='src/game/event/rows.ts:50', does='the bays of a bay row', sig='(d)')],
    inputs=[], outputs=[],
    tests=['tests/carpark.test.ts', 'tests/rows.test.ts', 'tests/carpark-angle.test.ts'],
    below=[], above=[], dual='none in this module: the Car park tool removes a lot (course or ui, not mapped here)',
    seams=['CarParkDef', 'BayRowDef'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port parkCost and rowBays (event/carpark.ts:304, event/rows.ts:50)',
)
