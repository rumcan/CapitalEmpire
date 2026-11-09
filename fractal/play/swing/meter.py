"""play.swing.meter: Swing meter outcome. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.swing.meter.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.swing.meter', rung=3, title='Swing meter outcome',
    purpose="The three clicks become a shot effect: the miss's way and size.",
    requires=['A better golfer has a slower marker and a wider sweet spot (golf-play-swing.test.ts).', 'Early on the way back a swing misses left (pull, then hook); late, right (push, then slice) (golf-play-swing.test.ts).'],
    files=['src/game/golf/play/swing.ts'],
    dynamics=[Fn(name='swingEffect', at='src/game/golf/play/swing.ts:82', does='the three clicks become a shot effect: shape and how far the miss is', sig='(o, skill, putting, sweet=1, miss=1, speed=1)'),
        Fn(name='swingTime', at='src/game/golf/play/swing.ts:55', does='seconds for one marker sweep, falling as skill rises', sig='(skill, speed=1)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-swing.test.ts', 'tests/golf-play-stats.test.ts'],
    below=[], above=[], dual="takeMulligan (golf/play/yours.ts:214) re-plays a bad shot on the owner's card",
    seams=['GolfSave swing outcome (saved with the input)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port swingTime and swingEffect (golf/play/swing.ts:55, :82); needs METER_TIME and BOOST (swing.ts 1-54) and the SwingOutcome fields',
)
