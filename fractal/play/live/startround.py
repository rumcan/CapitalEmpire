"""play.live.startround: Start round clock. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.live.startround.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.live.startround', rung=3, title='Start round clock',
    purpose='The start-round button: the clock runs to the tee time, the round begins when it has come, and it slows near the tee.',
    requires=['The start-round clock runs on to the tee time and begins the round when it has come (golf-start-round.test.ts).', 'On the course the clock runs no faster than the watching speed (golf/startround.ts:28).'],
    files=['src/game/golf/startround.ts'],
    dynamics=[Fn(name='bookingStep', at='src/game/golf/startround.ts:34', does='whether a booking waits, is due, or is gone', sig='(b, day, dayMin)'),
        Fn(name='ffSpeed', at='src/game/golf/startround.ts:15', does='the fast-forward speed as the tee nears', sig='(left)'),
        Fn(name='roundSpeed', at='src/game/golf/startround.ts:28', does='the speed on the course, capped at the watching speed', sig='(k, onCourse)')],
    inputs=[], outputs=[],
    tests=['tests/golf-start-round.test.ts'],
    below=[], above=[], dual='a pause or a slower speed goes through (golf-start-round.test.ts); the plan is dropped when its day is over',
    seams=['StartPlan'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port bookingStep, ffSpeed and roundSpeed (golf/startround.ts:15, :28, :34); needs FF_SPEED and WATCH_SPEED',
)
