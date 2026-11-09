"""business.eventtool.venue: Venue gates and toilets. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.eventtool.venue.json."""
from fractal.holon import Fn, Holon

STEER = {'cubicle_spectators': 120}

def toilets_needed(*, spectators: float, knobs=None) -> int:
    """the cubicles a crowd needs: spectators over cubicle_spectators, rounded up (venue.ts:34)"""
    import math
    k = {**STEER, **(knobs or {})}
    return math.ceil(spectators / float(k["cubicle_spectators"]))


HOLON = Holon(
    id='business.eventtool.venue', rung=3, title='Venue gates and toilets',
    purpose="The venue's entrance gates and their queue by minute, and the cubicles a crowd needs.",
    requires=['toiletsNeeded is the spectators over 120, rounded up (golf/venue.ts:34).', 'The gate queue is a deterministic first-in first-out queue (golf/venue.ts header).'],
    files=['src/game/golf/venue.ts'],
    dynamics=[Fn(name='gateQueue', at='src/game/golf/venue.ts:17', does='the gate queue by minute', sig='(arrivalsPerMinute, lanes, express)'),
        Fn(name='toiletsNeeded', at='src/game/golf/venue.ts:34', does='the cubicles a crowd needs', sig='(spectators)'),
        Fn(name='gateRate', at='src/game/golf/venue.ts:10', does="the gate's rate by lanes", sig='(lanes, express)')],
    inputs=[], outputs=[],
    tests=['tests/golf-event.test.ts', 'tests/golf-gatequeue-measured.test.ts'],
    below=[], above=[], dual='none: derived each minute',
    seams=['GateQ'], rules=[],
    impl='native',
    fn=toilets_needed, params={}, steer=STEER, port='todo: port gateQueue and gateRate (golf/venue.ts:10, :17); toiletsNeeded is ported',
)
