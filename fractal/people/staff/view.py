"""people.staff.view: The crew as people on the course (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='people.staff.view',
    rung=3,
    title='The crew as people on the course',
    purpose='What the grounds crew looks like at a minute of the town day: each worker on his leg, on foot or riding, with the carts and mowers.',
    requires=['Workers walk after the schedule at the walk cap and ride at the cart cap (crewview.ts header).', "cupSetAt gives a hole's cup at a day (crewview.ts:71)."],
    files=['src/game/golf/crewview.ts'],
    dynamics=[
        Fn(name='CrewView', at='src/game/golf/crewview.ts:27', does="the crew's view of one day", sig='class CrewView'),
        Fn(name='update', at='src/game/golf/crewview.ts:36', does='places each worker and vehicle at a minute', sig='(minute, now, x0, y0, x1, y1, simT?, rate?) => void'),
        Fn(name='cupSetAt', at='src/game/golf/crewview.ts:71', does='the cup of a hole at a day', sig='(day, n) => number | null')],
    inputs=['a CrewDay and a minute'],
    outputs=['CrewPerson and CrewThing lists'],
    tests=['golf-crew.test.ts'],
    below=['people.staff.day', 'people.animation'],
    above=['render'],
    dual='derived each frame; nothing to undo',
    rules=['lit sprites are never mirrored'],
    impl='describe',
)
