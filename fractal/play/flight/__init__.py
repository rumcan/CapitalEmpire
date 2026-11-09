"""play.flight: Ball flight and roll (T410). How a full shot, chip or putt flies, lands and rolls, the landing's look, and a picture of a flight."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.flight', rung=2, title='Ball flight and roll',
    purpose="How a full shot, chip or putt flies, lands and rolls, the landing's look, and a picture of a flight.",
    requires=['Every full shot and chip records where it landed and where its roll stopped, with their lies (golf-ball-roll.test.ts).', "The carry is the club's length times (0.65 + 0.35 x skill) (golf/play/shot.ts:63)."],
    below=['course', 'land'], above=['ui', 'render'],
    dual=None, rules=[],
)
