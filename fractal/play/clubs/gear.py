"""play.clubs.gear: Laser rangefinder. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.clubs.gear.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.clubs.gear', rung=3, title='Laser rangefinder',
    purpose="The laser card's report: the distance to the pin to a tenth of a metre and what lies along the line.",
    requires=["The laser's report gives the distance to the pin to a tenth of a metre (golf/play/tools.ts header)."],
    files=['src/game/golf/play/tools.ts'],
    dynamics=[Fn(name='laserReport', at='src/game/golf/play/tools.ts:19', does="the laser's report for a ball, its aim and the pin", sig='(view, ball, aim, pin)'),
        Fn(name='greenRead', at='src/game/golf/play/tools.ts:47', does='the cross and along break read on a green', sig='(height, ball, pin)')],
    inputs=[], outputs=[],
    tests=['tests/golf-card-catalogue.test.ts'],
    below=[], above=[], dual='none: derived from the course each time',
    seams=['CourseView.lieAt'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port laserReport and greenRead (golf/play/tools.ts:19, :47); needs CourseView.lieAt',
)
