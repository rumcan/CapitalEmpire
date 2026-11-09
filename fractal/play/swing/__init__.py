"""play.swing: The swing meter (T410). The three-click swing that sets the owner's power, accuracy and shot shape, and the spin dot."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.swing', rung=2, title='The swing meter',
    purpose="The three-click swing that sets the owner's power, accuracy and shot shape, and the spin dot.",
    requires=['The sweet spot is a window in time, 80 ms to 190 ms wide as skill rises from 0 to 1 (golf-play-swing.test.ts).'],
    below=['course'], above=['ui', 'people'],
    dual=None, rules=[],
)
