"""business.tournamentday.calendar: Calendar and timeline. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.tournamentday.calendar.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.tournamentday.calendar', rung=3, title='Calendar and timeline',
    purpose="The year's months, the day's clock, when fans arrive and leave, and who is late.",
    requires=['The day runs from 05:00 at one game minute per sim second (golf/daytimeline.ts header).'],
    files=['src/game/golf/calendar.ts', 'src/game/golf/daytimeline.ts'],
    dynamics=[Fn(name='wantedArrivals', at='src/game/golf/daytimeline.ts:67', does='the arrival minutes the fans want', sig='(n, seed)'),
        Fn(name='isLate', at='src/game/golf/daytimeline.ts:111', does='whether a minute is late', sig='(m)'),
        Fn(name='arrivalShare', at='src/game/golf/calendar.ts:70', does='the share of fans arriving at a time', sig='(t)')],
    inputs=[], outputs=[],
    tests=['tests/golf-daytimeline.test.ts', 'tests/golf-newgame-month.test.ts'],
    below=[], above=[], dual='none: a timeline',
    seams=['the town clock'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port wantedArrivals and arrivalShare (golf/daytimeline.ts:67, golf/calendar.ts:70)',
)
