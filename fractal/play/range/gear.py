"""play.range.gear: Range gear for your game. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.range.gear.json."""
from fractal.holon import Fn, Holon

STEER = {'video_gain': 1.15, 'fans_fatigue': 0.8, 'weighted_power': 1.5, 'lmon_swing': 1.25, 'radar_accuracy': 1.6}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.range.gear', rung=3, title='Range gear for your game',
    purpose="The gear the range sells to your own practice: the video, the weighted club, the radar and the lab's gains.",
    requires=['The range gear raises the gains of your practice sessions, the right ones, and nothing without it (golf-range-tree.test.ts).'],
    files=['src/game/golf/rangegear.ts'],
    dynamics=[Fn(name='practiceGear', at='src/game/golf/rangegear.ts:12', does="the gear's gains for the owned upgrades", sig='(owned)')],
    inputs=[], outputs=[],
    tests=['tests/golf-range-tree.test.ts'],
    below=[], above=[], dual='none: derived from the owned list',
    seams=['PracticeGear'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port practiceGear with its gains (golf/rangegear.ts:9-12); steer holds the five numbers',
)
