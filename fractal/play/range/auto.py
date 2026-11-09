"""play.range.auto: Staff and machines. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.range.auto.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.range.auto', rung=3, title='Staff and machines',
    purpose='The attendants on shift, the robots, the washer and the bottleneck of the flow panel.',
    requires=["The flow panel's bottleneck is the stage that takes the fewest balls an hour (golf-range-auto.test.ts).", 'A node gives ROBOTS_A_NODE robots, each on three hours of four (golf-range-auto.test.ts).'],
    files=['src/game/golf/rangeauto.ts'],
    dynamics=[Fn(name='flowOf', at='src/game/golf/rangeauto.ts:90', does="the flow panel's stages and the bottleneck", sig='(o)'),
        Fn(name='staffBps', at='src/game/golf/rangeauto.ts:64', does="the attendants' balls an hour on a shift", sig='(a, pick, h, start)'),
        Fn(name='robotBps', at='src/game/golf/rangeauto.ts:69', does="the robots' balls an hour", sig='(a)')],
    inputs=[], outputs=[],
    tests=['tests/golf-range-auto.test.ts', 'tests/golf-range-pacing.test.ts'],
    below=[], above=[], dual='MISSING: no function releases a hired attendant or machine; onShift (golf/rangeauto.ts:60) only says whether one is on shift',
    seams=['AutoKit from the range tree'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port flowOf, staffBps and robotBps (golf/rangeauto.ts:90, :64, :69)',
)
