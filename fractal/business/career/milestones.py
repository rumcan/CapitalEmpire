"""business.career.milestones: Population milestones. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.career.milestones.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.career.milestones', rung=3, title='Population milestones',
    purpose="The career: the milestone a population reaches, what each unlocks, and the win at the city's population.",
    requires=['reachedFor is the index of the last milestone the population reaches (career.test.ts).', 'A jump to 7000 returns Town, Large town and City in order, and the win comes once (career.test.ts).'],
    files=['src/game/career.ts'],
    dynamics=[Fn(name='reachedFor', at='src/game/career.ts:36', does='the index of the last milestone reached', sig='(pop)'),
        Fn(name='classUnlocked', at='src/game/career.ts:42', does='whether a road class is unlocked', sig='(id, reached)'),
        Fn(name='unlockOf', at='src/game/career.ts:48', does='the milestone that unlocks a class, junction or tunnels', sig='(kind, id)')],
    inputs=[], outputs=[],
    tests=['tests/career.test.ts'],
    below=[], above=[], dual='MISSING: an unlock is never taken back; career never un-reaches (src/game/career.ts:55)',
    seams=['Career save'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port reachedFor and Career.update (src/game/career.ts:36, :55); needs the MILESTONES table',
)
