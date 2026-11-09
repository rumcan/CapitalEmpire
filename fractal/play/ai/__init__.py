"""play.ai: AI golfers and the money match (T410). The AI golfers: the everyday tee sheet, caddies and carts, and the money match against a person."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.ai', rung=2, title='AI golfers and the money match',
    purpose='The AI golfers: the everyday tee sheet, caddies and carts, and the money match against a person.',
    requires=["A money match's stake is at least the least and at most what both golfers can afford (golf-match.test.ts).", "The day's roster is seeded from the seed and the day (golf/everyday.ts:72)."],
    below=['business', 'people'], above=['ui', 'business'],
    dual=None, rules=[],
)
