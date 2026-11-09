"""play.putting: Putting and the green (T410). The break on a green, the cup's fate, the tracers and the holed-out celebration."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.putting', rung=2, title='Putting and the green',
    purpose="The break on a green, the cup's fate, the tracers and the holed-out celebration.",
    requires=["A putt drops only near the cup's centre and slow enough: cupFate returns drop, lip or miss (golf-green.test.ts)."],
    below=['land', 'course'], above=['ui', 'people'],
    dual=None, rules=[],
)
