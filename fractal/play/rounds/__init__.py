"""play.rounds: The round (T410). The field, the tee times and the whole day's round, the played course and the finish."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.rounds', rung=2, title='The round',
    purpose="The field, the tee times and the whole day's round, the played course and the finish.",
    requires=['The field is seeded and deterministic: the same tier and seed give the same golfers (golf/play/field.ts).', 'A course of another count is cycled to 18 holes (golf-play-course.test.ts).'],
    below=['course', 'land'], above=['people', 'business', 'ui'],
    dual=None, rules=[],
)
