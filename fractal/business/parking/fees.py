"""business.parking.fees: Parking fees and park-and-ride. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.parking.fees.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.parking.fees', rung=3, title='Parking fees and park-and-ride',
    purpose="The parking fee's demand and income, and which car park qualifies as park-and-ride.",
    requires=['Park-and-ride qualifies a lot by its bus route and its distance from the clubhouse (golf/parkride.ts:34).'],
    files=['src/game/golf/parkingfee.ts', 'src/game/golf/parkride.ts'],
    dynamics=[Fn(name='parkingDemandMultiplier', at='src/game/golf/parkingfee.ts:22', does='the demand multiplier for a fee', sig='(fee)'),
        Fn(name='computeParkingIncome', at='src/game/golf/parkingfee.ts:49', does='the parking income for cars at a fee', sig='(carsParked, fee)'),
        Fn(name='isParkAndRideLot', at='src/game/golf/parkride.ts:34', does='whether a car park is a park-and-ride lot', sig='(...)')],
    inputs=[], outputs=[],
    tests=['tests/golf-parkingfee.test.ts', 'tests/golf-parkride.test.ts'],
    below=[], above=[], dual='none: derived each time',
    seams=['ParkingFee'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port parkingDemandMultiplier and computeParkingIncome (golf/parkingfee.ts:22, :49)',
)
