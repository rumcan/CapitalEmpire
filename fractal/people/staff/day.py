"""people.staff.day: The grounds crew's day (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='people.staff.day',
    rung=3,
    title="The grounds crew's day",
    purpose="The crew works the course's jobs each day: cups, greens, fairways and rough, planned from the course grid.",
    requires=['crewFor gives one greenkeeper and one mower per 9 holes, rounded up (crew.ts:304).', "Everyone goes back to the yard at the shift's end: greenkeepers at 14:00, mowers at 18:00 (GK_HOME, MO_HOME, crew.ts:22)."],
    files=['src/game/golf/crew.ts', 'src/game/golf/crewground.ts'],
    dynamics=[
        Fn(name='crewDay', at='src/game/golf/crew.ts:233', does="the crew's legs for one day", sig='(inp: CrewInputs) => CrewDay'),
        Fn(name='crewGround', at='src/game/golf/crewground.ts:197', does='the ground the crew works on one hole', sig='(g, n, cells, line, ...) => CrewGround'),
        Fn(name='crewFor', at='src/game/golf/crew.ts:304', does='the crew size for a number of holes', sig='(holes) => {gk, mo}')],
    inputs=['the course grid, the holes, the jobs due'],
    outputs=['CrewDay: workers, cups, mown passes'],
    tests=['golf-crew.test.ts', 't377-crew-route.test.ts'],
    below=['people.staff.hire', 'course'],
    above=['people.staff.view'],
    dual="MISSING: the day's mown passes and cup moves are not undone; a played day stays as it was",
    seams=['CrewSave'],
    rules=['performance is a hard gate'],
    impl='native',
    steer={'crew_out': 360, 'gk_home': 840, 'mo_home': 1080, 'cut_min': 3.5, 'fill_min': 2, 'set_min': 0.5, 'cup_lead': 6, 'wait_home': 60, 'speed': {'walk': 40, 'cart': 160, 'reel': 55, 'push': 30, 'rotary': 50, 'rake': 12}},
    port='todo: port crewDay (crew.ts:233), crewGround (crewground.ts:197) and crewFor (crew.ts:304) on the steer values',
    fn=ported,
)
