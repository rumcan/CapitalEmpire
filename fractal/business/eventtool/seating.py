"""business.eventtool.seating: Event seating. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.eventtool.seating.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.eventtool.seating', rung=3, title='Event seating',
    purpose="The authored seating geometry for an event and the groups the Event tool's panels show.",
    requires=['proposedSeating lays out the seats in columns and rows, tiered or flat (golf/event-seating.ts:70).'],
    files=['src/game/golf/event-seating.ts', 'src/game/golf/structure-groups.ts'],
    dynamics=[Fn(name='proposedSeating', at='src/game/golf/event-seating.ts:70', does='a proposed seating layout', sig='(columns, rows, tiered=False)'),
        Fn(name='seatingProblems', at='src/game/golf/event-seating.ts:28', does='the problems of a seating layout', sig='(layout, expected)'),
        Fn(name='groupOf', at='src/game/golf/structure-groups.ts:17', does='the panel group a structure type is in', sig='(typeId)')],
    inputs=[], outputs=[],
    tests=['tests/event-seating.test.ts', 'tests/structure-groups.test.ts'],
    below=[], above=[], dual='none: a layout',
    seams=['AuthoredSeating'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port proposedSeating and seatingProblems (golf/event-seating.ts:70, :28)',
)
