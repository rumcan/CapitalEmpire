"""play.clubs.bag: Bag and upgrades. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.clubs.bag.json."""
from fractal.holon import Fn, Holon

STEER = {'low_loft': 16, 'mid_loft': 30, 'high_loft': 42, 'run_on': 1.04, 'run_soft': 0.6}

def launch_word(*, loft: float, knobs=None) -> str:
    """the launch word for a loft (bag.ts:227)"""
    k = {**STEER, **(knobs or {})}
    return "Low" if loft <= k["low_loft"] else "Mid" if loft <= k["mid_loft"] else "High" if loft <= k["high_loft"] else "Very high"


def run_word(*, run: float, knobs=None):
    """the run word for a club's run, or None for a normal one (bag.ts:229)"""
    k = {**STEER, **(knobs or {})}
    return "runs on" if run > k["run_on"] else "lands soft" if run < k["run_soft"] else None


HOLON = Holon(
    id='play.clubs.bag', rung=3, title='Bag and upgrades',
    purpose="The clubs, their levels and fitted parts, the price of an upgrade, and the words for a club's launch and run.",
    requires=['Launch words: Low up to loft 16, Mid to 30, High to 42, else Very high (golf/play/bag.ts:227).', 'Run words: runs on above 1.04, lands soft below 0.6, else nothing (golf/play/bag.ts:229).'],
    files=['src/game/golf/play/bag.ts'],
    dynamics=[Fn(name='upgradeClub', at='src/game/golf/play/bag.ts:167', does='buys the next level of a club and returns the bag and the cost', sig='(bag, club, voucher=False)'),
        Fn(name='bagMods', at='src/game/golf/play/bag.ts:123', does="the bag's mods from its levels and parts", sig='(bag)'),
        Fn(name='launchWord', at='src/game/golf/play/bag.ts:227', does='the launch word for a loft', sig='(loft)'),
        Fn(name='runWord', at='src/game/golf/play/bag.ts:229', does="the run word for a club's run", sig='(run)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-bag.test.ts', 'tests/golf-play-club-roll.test.ts'],
    below=[], above=[], dual="MISSING: no function lowers a club's level; upgradeClub (golf/play/bag.ts:167) only raises it",
    seams=['BagSave in GolfSave.player'], rules=[],
    impl='native',
    fn=launch_word, params={}, steer=STEER, port='todo: port upgradeClub, bagView and fitPart (golf/play/bag.ts:167, :256, :190); needs CLUB_ORDER, PRICES and PARTS (bag.ts 1-80)',
)
