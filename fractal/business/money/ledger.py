"""business.money.ledger: Treasury and ledger. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.money.ledger.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.money.ledger', rung=3, title='Treasury and ledger',
    purpose="The city's treasury: the day's tax, takings and upkeep, the loans and the ledger the next day shows.",
    requires=['Property tax: a built residential lot at access 1 on a street pays 12 (budget.test.ts).', 'Segment upkeep: 100 tiles of street ground is 150, a bridge 600 (budget.test.ts).'],
    files=['src/game/budget.ts', 'src/game/moneyfloats.ts'],
    dynamics=[Fn(name='lotTax', at='src/game/budget.ts:104', does="a lot's property tax", sig='(l)'),
        Fn(name='compensation', at='src/game/budget.ts:109', does="compensation for a lot's use and level", sig='(l)'),
        Fn(name='segUpkeep', at='src/game/budget.ts:114', does="a road segment's upkeep", sig='(s)'),
        Fn(name='saleOf', at='src/game/budget.ts:50', does="a lot's sale value by class", sig='(cls)')],
    inputs=[], outputs=[],
    tests=['tests/budget.test.ts', 'tests/golf-money-fixes.test.ts', 'tests/business-taxi.test.ts'],
    below=[], above=[], dual="MISSING: a day's books cannot be reopened; the budget's endDay applies the day to the treasury at once",
    seams=["the save's treasury", 'the ledger'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port lotTax, compensation and segUpkeep (src/game/budget.ts:104, :109, :114) and the Budget day (endDay)',
)
