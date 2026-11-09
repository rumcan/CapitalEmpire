"""play.lies: Lies, slope and conditions (T410). How the ball sits, the slope under it, the wind and the conditions a shot is made in."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.lies', rung=2, title='Lies, slope and conditions',
    purpose='How the ball sits, the slope under it, the wind and the conditions a shot is made in.',
    requires=['Each golf surface plays as its lie (golf-play-course.test.ts, lieAt).', "The flier chance is the lie's factor times the club's, capped at 1 (golf/play/lies.ts:72)."],
    below=['course', 'land'], above=['ui', 'people'],
    dual=None, rules=[],
)
