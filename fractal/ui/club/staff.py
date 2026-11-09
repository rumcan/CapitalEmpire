"""ui.club.staff: The Staff card (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.club.staff',
    rung=3,
    title='The Staff card',
    purpose="The club's staff card: the pro's office and the teaching huts, with Hire and Let go.",
    requires=["A filled row has the person's picture, name, wage and this season's work; an open row has Hire with its wage (StaffCard header).", 'Let go asks inline, with no modal (StaffCard header).'],
    files=['src/ui/golf/StaffCard.tsx'],
    dynamics=[
        Fn(name='StaffCard', at='src/ui/golf/StaffCard.tsx:26', does='the Staff card', sig='({view, right, onClose, onHire, onLetGo}) => JSX')],
    inputs=['the staff view'],
    outputs=['hire and let-go clicks'],
    tests=['ui-club-card.test.ts', 'ui-menu-fixes.test.ts', 'golf-staff.test.ts'],
    below=['people.staff.hire'],
    above=['ui.rail'],
    dual='Let go undoes a hire (changeStaff with -1)',
    rules=['no flat colour washes'],
    impl='describe',
)
