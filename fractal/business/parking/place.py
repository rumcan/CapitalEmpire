"""business.parking.place: Where a car park may go. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.parking.place.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.parking.place', rung=3, title='Where a car park may go',
    purpose="The Car park tool's rules: where a car park may be laid and whether it snaps to the road; walking distance to a venue.",
    requires=['walkServes is true when the walk is within WALK_SERVE_M (golf/walkserve.ts:38).', 'A car park snaps onto the road beside it at the verge (golf/parkplace.ts header).'],
    files=['src/game/golf/parkplace.ts', 'src/game/golf/walkserve.ts', 'src/game/parking-overlay.ts', 'src/game/walkserve-overlay.ts'],
    dynamics=[Fn(name='carParkWhy', at='src/game/golf/parkplace.ts:72', does='why a car park cannot go here', sig='(d, c)'),
        Fn(name='snapToRoad', at='src/game/golf/parkplace.ts:84', does='snaps a car park onto its road', sig='(net, d, reach)'),
        Fn(name='servesOf', at='src/game/golf/walkserve.ts:41', does='which venues a car park serves on foot', sig='(bays, venues, rect)')],
    inputs=[], outputs=[],
    tests=['tests/golf-parkplace.test.ts', 'tests/golf-walkserve.test.ts'],
    below=[], above=[], dual='none: a placement check',
    seams=['RoadNetwork'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port walkServes and carParkWhy (golf/walkserve.ts:38; golf/parkplace.ts:72)',
)
