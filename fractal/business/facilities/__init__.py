"""business.facilities: Facilities: clubhouse, pro, practice and placing (T410). The clubhouse and its members and events, the halfway house, the pro and the lessons, the practice area, and the placing rules for upgrades."""
from fractal.holon import Holon

HOLON = Holon(
    id='business.facilities', rung=2, title='Facilities: clubhouse, pro, practice and placing',
    purpose='The clubhouse and its members and events, the halfway house, the pro and the lessons, the practice area, and the placing rules for upgrades.',
    requires=["A club's members come from a fair price band (golf/club.ts: fairPrice, fairBand).", "A practice facility's refund on removal is facilityRefund (golf/practicebuild.ts:214)."],
    below=['business.eventtool', 'course', 'play'], above=['ui', 'business'],
    dual=None, rules=[],
)
