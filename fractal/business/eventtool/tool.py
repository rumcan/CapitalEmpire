"""business.eventtool.tool: Event tool placement and day. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.eventtool.tool.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.eventtool.tool', rung=3, title='Event tool placement and day',
    purpose="Where a structure may go, what it costs to place, and the day's takings and queues.",
    requires=['checkStructurePlacement enforces the tier locks, rent and buy rules and the hole corridors (golf-eventtool.test.ts).', 'evaluateEventToolDay distributes the crowd across holes and gates by catchment weight (golf-eventtool.test.ts).'],
    files=['src/game/golf/eventtool.ts'],
    dynamics=[Fn(name='checkStructurePlacement', at='src/game/golf/eventtool.ts:180', does='why a structure may not be placed', sig='(candidate, ...)'),
        Fn(name='evaluateEventToolDay', at='src/game/golf/eventtool.ts:276', does="the day's takings, queues and needs", sig='(opts)'),
        Fn(name='structurePlaceCost', at='src/game/golf/eventtool.ts:166', does='the cost to place a structure, rent or buy', sig='(typeId, mode)'),
        Fn(name='findStructureIndexAt', at='src/game/golf/eventtool.ts:109', does='finds the structure at a point, to remove it', sig='(...)')],
    inputs=[], outputs=[],
    tests=['tests/golf-eventtool.test.ts', 'tests/golf-eventtool-wire.test.ts'],
    below=[], above=[], dual='findStructureIndexAt (golf/eventtool.ts:109) finds the structure to remove',
    seams=['PlacedEventStructure'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port structurePlaceCost, checkStructurePlacement and evaluateEventToolDay (golf/eventtool.ts:166, :180, :276)',
)
