"""people.staff: The grounds staff and the crew (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='people.staff',
    rung=2,
    title='The grounds staff and the crew',
    purpose="The greenkeepers and mower operators the player hires, the crew's day on the course, and the crew as people at a minute of the town day.",
    requires=['A greenkeeper costs 320 and a mower operator 280 a month (staff.ts WAGE); STAFF_MAX is 6 (staff.ts:18).', 'crewFor gives one greenkeeper and one mower per 9 holes, rounded up (crew.ts:304).'],
    below=['business', 'course'],
    above=['ui'],
    dual='see the three processes',
    rules=["town jams are the player's job"],
)
