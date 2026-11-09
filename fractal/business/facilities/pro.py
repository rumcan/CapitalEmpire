"""business.facilities.pro: Pro and lessons. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.facilities.pro.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.facilities.pro', rung=3, title='Pro and lessons',
    purpose="The club's pros: hiring and letting go, the wages and the lessons a month.",
    requires=['letGoPro dismisses a pro, so a hire can be undone (golf/pros.ts:128).'],
    files=['src/game/golf/pros.ts'],
    dynamics=[Fn(name='hirePro', at='src/game/golf/pros.ts:122', does='hires a pro at a place', sig='(s, role, at, month, seed)'),
        Fn(name='letGoPro', at='src/game/golf/pros.ts:128', does='lets a pro go, with the cost', sig='(s, k)'),
        Fn(name='proWages', at='src/game/golf/pros.ts:149', does="the pros' wages a month", sig='(s)'),
        Fn(name='lessonsMonth', at='src/game/golf/pros.ts:167', does='the lessons a month for the seen and the inputs', sig='(seen, i, months)')],
    inputs=[], outputs=[],
    tests=['tests/golf-pros.test.ts'],
    below=[], above=[], dual='letGoPro (golf/pros.ts:128) dismisses a pro',
    seams=['StaffState'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port hirePro, letGoPro and proWages (golf/pros.ts:122, :128, :149)',
)
