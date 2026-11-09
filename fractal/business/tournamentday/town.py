"""business.tournamentday.town: Town growth after a tournament. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.tournamentday.town.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.tournamentday.town', rung=3, title='Town growth after a tournament',
    purpose="The town's resident growth rate after a tournament, from satisfaction, attendance, tier and reputation.",
    requires=['The growth rate comes from satisfaction, attendance share, tier and reputation (golf/towngrowth.ts header).'],
    files=['src/game/golf/towngrowth.ts'],
    dynamics=[Fn(name='townGrowthRate', at='src/game/golf/towngrowth.ts:52', does='the resident growth rate', sig='(input)'),
        Fn(name='townGrowthTargets', at='src/game/golf/towngrowth.ts:99', does='the target populations for a rate', sig='(popK, rate)')],
    inputs=[], outputs=[],
    tests=['tests/golf-towngrowth.test.ts', 'tests/town-earnings.test.ts'],
    below=[], above=[], dual='none: a rate for the next year, recomputed',
    seams=['TownGrowthInput'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port townGrowthRate and townGrowthTargets (golf/towngrowth.ts:52, :99)',
)
