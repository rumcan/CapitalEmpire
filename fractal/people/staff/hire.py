"""people.staff.hire: Hire, wages and the day's work (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='people.staff.hire',
    rung=3,
    title="Hire, wages and the day's work",
    purpose='The greenkeepers, mower operators and club pros: the wages, and the work each town day gives the staff.',
    requires=["A greenkeeper's wage is 320 a month and a mower operator's 280 (staff.ts WAGE); the shifts are 420 and 600 minutes (SHIFT).", 'Club roles are at most 1 head pro, 3 teaching pros and 1 secretary (CLUB_MAX, staff.ts:27).'],
    files=['src/game/golf/staff.ts'],
    dynamics=[
        Fn(name='changeStaff', at='src/game/golf/staff.ts:161', does='hires one more or lets one go', sig='(s, role, delta: 1 | -1) => {s, cost} | null'),
        Fn(name='payWages', at='src/game/golf/staff.ts:155', does="pays the month's wages", sig='(s, month) => {s, due}'),
        Fn(name='workDay', at='src/game/golf/staff.ts:109', does="the staff's work on one town day", sig='(s, day, holes) => StaffState')],
    inputs=['the staff state, a role, a day'],
    outputs=['the staff state; a cost or a due amount'],
    tests=['golf-staff.test.ts', 'golf-club.test.ts', 'golf-pros.test.ts', 'golf-balance-income.test.ts'],
    below=['business'],
    above=['ui.club.staff', 'people.staff.day'],
    dual='MISSING: wages already paid (payWages) cannot be refunded; a hire is undone by letting that person go (changeStaff with -1)',
    seams=['StaffState save field'],
    rules=["town jams are the player's job"],
    impl='native',
    steer={'wage': {'gk': 320, 'mo': 280}, 'shift': {'gk': 420, 'mo': 600}, 'staff_max': 6, 'club_wage': {'head': 900, 'teach': 300, 'sec': 450}, 'club_max': {'head': 1, 'teach': 3, 'sec': 1}, 'condition_min': 40, 'stimp': 8.5},
    port='todo: port changeStaff (staff.ts:161), payWages (:155) and workDay (:109); steer holds the staff tables',
    fn=ported,
)
