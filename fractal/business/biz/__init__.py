"""business.biz: The businesses the player places (T410). The placed businesses: the catalogue and its demand formulas, and the visits they get from the towns."""
from fractal.holon import Holon

HOLON = Holon(
    id='business.biz', rung=2, title='The businesses the player places',
    purpose='The placed businesses: the catalogue and its demand formulas, and the visits they get from the towns.',
    requires=["A business's unlock is met only by the businesses already owned (src/game/business/catalogue.ts:141)."],
    below=['town'], above=['ui'],
    dual=None, rules=[],
)
