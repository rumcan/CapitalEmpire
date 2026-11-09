"""business.money.sponsors: Sponsors and TV. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.money.sponsors.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.money.sponsors', rung=3, title='Sponsors and TV',
    purpose="The tournament's sponsor income, TV income and the purse cost, by tier and reputation.",
    requires=['Sponsor income, TV income and the purse cost are set by tier and reputation (golf/sponsors.ts:12-28).'],
    files=['src/game/golf/sponsors.ts'],
    dynamics=[Fn(name='computeSponsorIncome', at='src/game/golf/sponsors.ts:12', does='the sponsor income', sig='(tier, reputation, cards)'),
        Fn(name='computeTvIncome', at='src/game/golf/sponsors.ts:20', does='the TV income for the needs met', sig='(tier, haveNeeds)'),
        Fn(name='computePurseCost', at='src/game/golf/sponsors.ts:28', does='the purse a tier pays out', sig='(tier)')],
    inputs=[], outputs=[],
    tests=['tests/golf-sponsors.test.ts', 'tests/golf-cards.test.ts'],
    below=[], above=[], dual='none: a sum for the year',
    seams=['Need (tour.ts)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port computeSponsorIncome, computeTvIncome, computePurseCost (golf/sponsors.ts:12, :20, :28)',
)
