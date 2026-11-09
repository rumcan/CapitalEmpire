"""business.parking: Car parks, curbs and car park fees (T410). The car parks the event and the golf venues need: bay rows, lots, on-street curbs, the fees, and where a car park may go."""
from fractal.holon import Holon

HOLON = Holon(
    id='business.parking', rung=2, title='Car parks, curbs and car park fees',
    purpose='The car parks the event and the golf venues need: bay rows, lots, on-street curbs, the fees, and where a car park may go.',
    requires=['A bay row lays bays along its front line at 90, 60 or 45 degrees (event/rows.ts header).', 'A car park serves a venue when its nearest bay is within the walking distance (golf/walkserve.ts, T237).'],
    below=['town', 'course'], above=['ui', 'business.event'],
    dual=None, rules=[],
)
