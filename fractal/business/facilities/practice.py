"""business.facilities.practice: Practice area plan. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.facilities.practice.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.facilities.practice', rung=3, title='Practice area plan',
    purpose="The practice area beside the range: its facilities, the plan's cost and the refund on removal.",
    requires=["A practice facility's refund on removal is facilityRefund (golf/practicebuild.ts:214)."],
    files=['src/game/golf/practice.ts', 'src/game/golf/practicebuild.ts'],
    dynamics=[Fn(name='practiceArea', at='src/game/golf/practice.ts:26', does='the practice area beside a plot', sig='(plot, facing)'),
        Fn(name='practicePlan', at='src/game/golf/practicebuild.ts:92', does='the plan of a practice facility', sig='(o)'),
        Fn(name='planCost', at='src/game/golf/practicebuild.ts:126', does='the cost of a plan on the grid', sig='(g, c)'),
        Fn(name='facilityRefund', at='src/game/golf/practicebuild.ts:214', does='the refund for a practice facility', sig='(f)')],
    inputs=[], outputs=[],
    tests=['tests/golf-practice.test.ts', 'tests/practice-tools.test.ts', 'tests/golf-range-guided.test.ts'],
    below=[], above=[], dual='facilityRefund (golf/practicebuild.ts:214) returns part of the cost on removal',
    seams=['PracticeFacility'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port facilityRefund and practicePlan (golf/practicebuild.ts:214, :92)',
)
