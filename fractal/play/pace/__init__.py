"""play.pace: Pace of play, walking and carts (T410). How fast the round is watched, the golfers' carts and walks, and the owner's own cart and step."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.pace', rung=2, title='Pace of play, walking and carts',
    purpose="How fast the round is watched, the golfers' carts and walks, and the owner's own cart and step.",
    requires=['No two groups are ever on one green (golf-pace.test.ts).', "The watching speed plays golf's hours at 1.5 game minutes a sim second (golf/watch.ts header)."],
    below=['course', 'people'], above=['ui', 'people', 'render'],
    dual=None, rules=[],
)
