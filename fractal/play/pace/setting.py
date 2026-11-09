"""play.pace.setting: Pace setting. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.pace.setting.json."""
from fractal.holon import Fn, Holon

STEER = {'fast': 'main', 'other': 'mix'}

def pace_of_setting(*, setting=None, knobs=None) -> str:
    """the pace a setting plays at: the fast setting is main, anything else mix (pace.ts:22)"""
    k = {**STEER, **(knobs or {})}
    return k["fast"] if setting == "fast" else k["other"]


HOLON = Holon(
    id='play.pace.setting', rung=3, title='Pace setting',
    purpose='The pace a setting plays at: the fast setting is the main pace, the others the mix.',
    requires=['paceOfSetting maps the fast setting to the main pace and any other to mix (golf/pace.ts:22).'],
    files=['src/game/golf/pace.ts'],
    dynamics=[Fn(name='paceOfSetting', at='src/game/golf/pace.ts:22', does='the pace for a setting', sig='(s)')],
    inputs=[], outputs=[],
    tests=['tests/golf-pace.test.ts', 'tests/golf-watch-speed.test.ts'],
    below=[], above=[], dual='none: a mapping',
    seams=['GolfPace'], rules=[],
    impl='native',
    fn=pace_of_setting, params={}, steer=STEER, port='',
)
