"""play.clubs.golfer: Your golfer profile. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='play.clubs.golfer', rung=3, title='Your golfer profile',
    purpose='Your golfer as a saved profile: the skills, the stats and the name, and what the start gives.',
    requires=['A new golfer starts with the START_SKILLS table (golf/player.ts:46).', "The profile's new stats start at 50 (golf-play-stats.test.ts)."],
    files=['src/game/golf/player.ts'],
    dynamics=[],
    inputs=[], outputs=[],
    tests=['tests/golf-player.test.ts', 'tests/golf-play-stats.test.ts'],
    below=[], above=[], dual='none: the profile is saved as GolfSave.player',
    seams=['GolfSave.player'], rules=[],
    impl='describe',
)
