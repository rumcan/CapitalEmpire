"""play.range: The range ball loop (T410). The driving range's balls: the buckets, the outfield, the picking, and the staff and machines that do it."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.range', rung=2, title='The range ball loop',
    purpose="The driving range's balls: the buckets, the outfield, the picking, and the staff and machines that do it.",
    requires=['The outfield holds FIELD_CAP (8000) balls: past it a ball is lost in the rough (golf/rangeballs.ts:18).', "A bucket holds BALLS_VISIT (40) balls at the reference day and scales with the day's length (golf/rangeballs.ts:16)."],
    below=['business', 'course'], above=['ui', 'business'],
    dual=None, rules=[],
)
