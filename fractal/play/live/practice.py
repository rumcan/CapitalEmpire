"""play.live.practice: Practice holes. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.live.practice.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.live.practice', rung=3, title='Practice holes',
    purpose="The hole card's Play: which holes to play (one, nine or eighteen) and what a hole is missing.",
    requires=["The hole card's Play picks the holes and says what a hole is missing (golf/play/practice.ts:16, :31)."],
    files=['src/game/golf/play/practice.ts'],
    dynamics=[Fn(name='practicePick', at='src/game/golf/play/practice.ts:16', does='the holes a practice play takes', sig='(view, n, scope)'),
        Fn(name='missingWhy', at='src/game/golf/play/practice.ts:31', does='why a hole cannot be played', sig='(n, parts)')],
    inputs=[], outputs=[],
    tests=['tests/golf-practice-hole.test.ts'],
    below=[], above=[], dual='none: pure rules',
    seams=['PracticeScope'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port practicePick and missingWhy (golf/play/practice.ts:16, :31)',
)
