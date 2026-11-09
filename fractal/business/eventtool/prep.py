"""business.eventtool.prep: Tournament prep. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.eventtool.prep.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.eventtool.prep', rung=3, title='Tournament prep',
    purpose='The prep quests: the structures the course still needs for the tier being prepared, in order.',
    requires=['prepDue lists the structures the course still needs, in order (prep.test.ts).'],
    files=['src/game/golf/prep.ts'],
    dynamics=[Fn(name='prepDue', at='src/game/golf/prep.ts:85', does='the prep steps still due, in order', sig='(f)'),
        Fn(name='prepCourseReady', at='src/game/golf/prep.ts:101', does='whether the course is ready for a tier', sig='(holes, tier)'),
        Fn(name='suggestSpot', at='src/game/golf/prep.ts:121', does='suggests a spot near a target', sig='(target, ok)')],
    inputs=[], outputs=[],
    tests=['tests/prep.test.ts'],
    below=[], above=[], dual='none: derived from the facts',
    seams=['PrepFacts'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port prepDue and prepCourseReady (golf/prep.ts:85, :101)',
)
