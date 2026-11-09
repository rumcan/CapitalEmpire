"""business.eventtool: The Event tool (T410). The Event tool's structures: placement rules, costs and the day's takings; tents; seating; tournament prep; the venue's gates."""
from fractal.holon import Holon

HOLON = Holon(
    id='business.eventtool', rung=2, title='The Event tool',
    purpose="The Event tool's structures: placement rules, costs and the day's takings; tents; seating; tournament prep; the venue's gates.",
    requires=['checkStructurePlacement enforces the tier locks, the rent and buy rules and the hole corridors (golf-eventtool.test.ts).', 'prepDue lists the structures the course still needs, in order (prep.test.ts).'],
    below=['business.tournamentday', 'business.facilities', 'course'], above=['ui', 'business.tournaments'],
    dual=None, rules=[],
)
