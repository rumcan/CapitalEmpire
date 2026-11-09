"""business.eventtool.tents: Tents and structure spend. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.eventtool.tents.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.eventtool.tents', rung=3, title='Tents and structure spend',
    purpose="The catalogue's tents: footprint, rent and buy, capacity and the spend per spectator a day.",
    requires=['spendPerSpectator is set per structure kind and tier (golf/tents.ts:56).'],
    files=['src/game/golf/tents.ts'],
    dynamics=[Fn(name='spendPerSpectator', at='src/game/golf/tents.ts:56', does='the spend per spectator a day', sig='(kind, tier)'),
        Fn(name='tentDay', at='src/game/golf/tents.ts:82', does="a tent's day: its visitors and takings", sig='(o)'),
        Fn(name='catchmentWeight', at='src/game/golf/tents.ts:75', does='the catchment weight by distance', sig='(distM)')],
    inputs=[], outputs=[],
    tests=['tests/golf-tentmoney.test.ts', 'tests/golf-tentbooks.test.ts', 'tests/golf-event.test.ts'],
    below=[], above=[], dual='none: derived each time',
    seams=['StructureKind'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port spendPerSpectator, catchmentWeight and tentDay (golf/tents.ts:56, :75, :82)',
)
