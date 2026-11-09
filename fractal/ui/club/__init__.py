"""ui.club: The clubhouse and the staff (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.club',
    rung=2,
    title='The clubhouse and the staff',
    purpose='The clubhouse card with its members and fees, the club title, and the Staff card that hires and lets go.',
    requires=['The clubhouse card shows members, visitors and the fees taken (ClubhouseCard header).', 'Hire shows its wage; Let go asks inline, with no modal (StaffCard header).'],
    below=['business', 'people.staff'],
    above=['ui.rail'],
    dual='Let go undoes a hire (changeStaff with -1, people.staff.hire)',
    rules=['no flat colour washes'],
)
