"""business.tournamentday.crowd: Crowd from outside. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.tournamentday.crowd.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.tournamentday.crowd', rung=3, title='Crowd from outside',
    purpose='The highway crowd by tier and the split of the crowd between the town and the highway; why fans are late.',
    requires=['The highway share and the entries come from the tier (golf/highwayentries.ts:23-38).', 'Late reasons are listed with the fix the player can make (golf/latereasons.ts:19).'],
    files=['src/game/golf/highwayentries.ts', 'src/game/golf/latereasons.ts'],
    dynamics=[Fn(name='splitTournamentCrowd', at='src/game/golf/highwayentries.ts:43', does='splits the crowd between the town and the highway', sig='(...)'),
        Fn(name='lateReasons', at='src/game/golf/latereasons.ts:19', does='the reasons fans were late, with the fix', sig='(f)'),
        Fn(name='trafficSatisfaction', at='src/game/golf/latereasons.ts:39', does='the traffic satisfaction from the trip time', sig='(meanTripS, freeFlowS)')],
    inputs=[], outputs=[],
    tests=['tests/golf-highwayentries.test.ts', 'tests/golf-latereasons.test.ts'],
    below=[], above=[], dual="none: derived from the day's facts",
    seams=['LateFacts'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port highwayCrowdShare, entryCountForTier and lateReasons (golf/highwayentries.ts:23, :28; golf/latereasons.ts:19)',
)
