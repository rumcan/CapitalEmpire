"""business.range: The range business: economy and site (T410). The driving range as a small business: its save, upgrades and demand; its layout, its start on the map, and its host scene."""
from fractal.holon import Holon

HOLON = Holon(
    id='business.range', rung=2, title='The range business: economy and site',
    purpose='The driving range as a small business: its save, upgrades and demand; its layout, its start on the map, and its host scene.',
    requires=['A new range has 4 bays, $6 and nothing bought (golf-rangebiz.test.ts).', 'The start demand is 0.0183 per pass-pop and resident a day (golf-rangebiz.test.ts).'],
    below=['business.money', 'play'], above=['ui', 'play'],
    dual=None, rules=[],
)
