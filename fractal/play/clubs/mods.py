"""play.clubs.mods: Stats and mods. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.clubs.mods.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.clubs.mods', rung=3, title='Stats and mods',
    purpose="The golfer's stats and the mods that stack on a club: the kit a club plays with.",
    requires=['Stat changes are added and held to 0..1; the factors multiply; the order does not matter (golf-play-stats.test.ts).', 'A plain skill plays every shot as before (golf-play-stats.test.ts).'],
    files=['src/game/golf/play/mods.ts'],
    dynamics=[Fn(name='kitOf', at='src/game/golf/play/mods.ts:95', does="a club's kit for a golfer with the mods", sig='(sk, club, ctx=None)'),
        Fn(name='applyMods', at='src/game/golf/play/mods.ts:75', does='the stats with the mods applied for a club', sig='(sk, club, ctx=None)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-stats.test.ts'],
    below=[], above=[], dual='none: mods are recomputed from the saved bag and stats on every shot',
    seams=['GameSkills (player.ts)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port applyMods and kitOf (golf/play/mods.ts:75, :95)',
)
