"""business.tournaments.yearend: Year-end book. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.tournaments.yearend.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.tournaments.yearend', rung=3, title='Year-end book',
    purpose="The year's tournament book: the ticket price, the close book, the tier progression and the reputation.",
    requires=["computeYearEnd gives the next year's state from the year's round result (golf/yearend.ts:320)."],
    files=['src/game/golf/yearend.ts'],
    dynamics=[Fn(name='computeYearEnd', at='src/game/golf/yearend.ts:320', does="the year-end state from the year's result", sig='(...)'),
        Fn(name='computeTournamentCloseBook', at='src/game/golf/yearend.ts:170', does='the book the tournament closes with', sig='(...)'),
        Fn(name='golfTicketPrice', at='src/game/golf/yearend.ts:136', does='the ticket price for a tier and cards', sig='(tier, cards)')],
    inputs=[], outputs=[],
    tests=['tests/golf-yearend.test.ts', 'tests/golf-money-fixes.test.ts'],
    below=[], above=[], dual='MISSING: no function reopens a closed year; computeYearEnd only returns the next state (golf/yearend.ts:320)',
    seams=['RoundResult (event/round.ts)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port golfTicketPrice and computeYearEnd (golf/yearend.ts:136, :320)',
)
