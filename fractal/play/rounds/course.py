"""play.rounds.course: The played course. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.rounds.course.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.rounds.course', rung=3, title='The played course',
    purpose='The course as the round plays it: 18 holes from the derived holes, and the lie at any point.',
    requires=['A 9-hole course is played twice (18 holes; golf-play-course.test.ts).', 'With no surface, the lie is rough within 40 tiles of a played line and out of bounds beyond (golf-play-course.test.ts).'],
    files=['src/game/golf/play/courseview.ts'],
    dynamics=[Fn(name='makeCourseView', at='src/game/golf/play/courseview.ts:47', does='the played course from the holes and the surface lookup', sig='(holes, surfAt, lotAt=None)'),
        Fn(name='holeFrom', at='src/game/golf/play/courseview.ts:36', does='a hole as played from its tee kind', sig='(h, want)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-course.test.ts'],
    below=[], above=[], dual='none: derived from the holes each time',
    seams=["CourseView (course domain's holes)"], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port makeCourseView and lieAt (golf/play/courseview.ts:47); surfAt is the course grid',
)
