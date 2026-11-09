"""business.facilities.clubhouse: Clubhouse, members and club events. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.facilities.clubhouse.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.facilities.clubhouse', rung=3, title='Clubhouse, members and club events',
    purpose="The club's members and dues, the club's yearly events and their entries, and the halfway house's takings.",
    requires=["The club's members come from a fair price band (golf/club.ts:51-55).", 'An entry in a club event is made with enter (golf/clubevents.ts:77).'],
    files=['src/game/golf/club.ts', 'src/game/golf/clubevents.ts', 'src/game/golf/halfway.ts', 'src/game/golf/drivestopgap.ts'],
    dynamics=[Fn(name='fairPrice', at='src/game/golf/club.ts:51', does="the fair price of the club's dues", sig='(quality, rep, holes, level)'),
        Fn(name='joinRate', at='src/game/golf/club.ts:87', does='the rate members join at a price', sig='(i, price)'),
        Fn(name='eventDue', at='src/game/golf/clubevents.ts:60', does='the club event due at a time', sig='(s, season, at)'),
        Fn(name='enter', at='src/game/golf/clubevents.ts:77', does='enters a club event', sig='(s, id, season, hcp)'),
        Fn(name='halfwayTakings', at='src/game/golf/halfway.ts:52', does="the halfway house's takings from new cars", sig='(newCars)')],
    inputs=[], outputs=[],
    tests=['tests/golf-club.test.ts', 'tests/golf-clubevents.test.ts', 'tests/t187-gaps.test.ts'],
    below=[], above=[], dual='MISSING: an entered club event cannot be withdrawn; enter (golf/clubevents.ts:77) has no reverse',
    seams=['ClubSave', 'ClubEventsSave'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port fairPrice, joinRate and eventDue (golf/club.ts:51, :87; golf/clubevents.ts:60)',
)
