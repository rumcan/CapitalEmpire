"""business.career: The career and the tiers (T410). The population milestones a town reaches, the lot tiers that gate the buildings, and the golf tour's five tiers."""
from fractal.holon import Holon

HOLON = Holon(
    id='business.career', rung=2, title='The career and the tiers',
    purpose="The population milestones a town reaches, the lot tiers that gate the buildings, and the golf tour's five tiers.",
    requires=['Milestones never un-reach (src/game/career.ts:55).', "The golf tour's tiers clamp to 1..5 (golf/tour.ts:50)."],
    below=['town', 'play'], above=['ui', 'core'],
    dual=None, rules=[],
)
