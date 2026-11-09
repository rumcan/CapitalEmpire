"""business.event.round: Event round state. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.event.round.json."""
from fractal.holon import Fn, Holon

STEER = {'signal_years': [1985, 1990, 2000], 'speed_years': [1985, 1990, 1995, 2000]}

def signal_tier_open(*, year: int, knobs=None) -> int:
    """the signal tier open in a year: the years reached, less one, at least 0 (event/round.ts:22)"""
    k = {**STEER, **(knobs or {})}
    years = list(k["signal_years"])
    return max(0, min(len(years) - 1, sum(1 for y in years if year >= y) - 1))


def speed_tier_open(*, year: int, knobs=None) -> int:
    """the speed tier open in a year (event/round.ts:26)"""
    k = {**STEER, **(knobs or {})}
    years = list(k["speed_years"])
    return max(0, min(len(years) - 1, sum(1 for y in years if year >= y) - 1))


HOLON = Holon(
    id='business.event.round', rung=3, title='Event round state',
    purpose="The event round's stages (free, build, surge, eval), the tier years and the day save.",
    requires=['The event round goes free, build, surge, eval and back to free with one run (event.test.ts).', 'The signal tier opens at 1985, 1990 and 2000 (event/round.ts:20-22).'],
    files=['src/game/event/round.ts', 'src/game/event/daysave.ts'],
    dynamics=[Fn(name='signalTierOpen', at='src/game/event/round.ts:22', does='the signal tier open in a year', sig='(year)'),
        Fn(name='speedTierOpen', at='src/game/event/round.ts:26', does='the speed tier open in a year', sig='(year)'),
        Fn(name='draftFor', at='src/game/event/round.ts:38', does='the card draft for a round', sig='(xp, runs, taken, golf=False)'),
        Fn(name='normalizeDaySave', at='src/game/event/daysave.ts:62', does='reads a saved tournament day', sig='(d)')],
    inputs=[], outputs=[],
    tests=['tests/event.test.ts', 'tests/golf-day-resume.test.ts'],
    below=[], above=[], dual='the round closes back to free (event.test.ts, Round: close into free)',
    seams=['Stage', 'DaySave in SaveV5.tourney'], rules=[],
    impl='native',
    fn=signal_tier_open, params={}, steer=STEER, port='todo: port draftFor and normalizeDaySave (event/round.ts:38, event/daysave.ts:62)',
)
