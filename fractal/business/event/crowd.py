"""business.event.crowd: Crowd, surge, buses and toll plaza. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.event.crowd.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.event.crowd', rung=3, title='Crowd, surge, buses and toll plaza',
    purpose='The crowd of a shuttle round: walkers and queues; the surge of party cars to the car parks; the bus routes; the toll booths.',
    requires=["A surge sends each home's cars to a car park joined to its road (event/surge.ts header).", 'The crowd walks straight at WALK_V to a lot stop, a door or a gate (event/crowd.ts header).'],
    files=['src/game/event/surge.ts', 'src/game/event/bus.ts', 'src/game/event/toll.ts'],
    dynamics=[Fn(name='walkPace', at='src/game/event/crowd.ts:21', does="a walker's pace by id", sig='(id)'),
        Fn(name='matchSink', at='src/game/event/surge.ts:32', does="the sink a surge's car matches to a park", sig='(P, o, e)'),
        Fn(name='plazaPoint', at='src/game/event/toll.ts:12', does='a point on the toll plaza', sig='(d, t, o)')],
    inputs=[], outputs=[],
    tests=['tests/crowdview.test.ts', 'tests/gates.test.ts', 'tests/surge-timeline.test.ts', 'tests/bus.test.ts', 'tests/toll.test.ts'],
    below=[], above=[], dual="none: the crowd is re-run from the round's seed and saved in the day save (event/daysave.ts)",
    seams=['CrowdSave, SurgeSave (daysave.ts)'], rules=["town jams are the player's job (never auto-fix congestion)"],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port="todo: port matchSink and the surge's timeline (event/surge.ts:32); walkPace (event/crowd.ts:21) is people's file, handed off",
)
