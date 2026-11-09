"""play.view.round: Golfers and balls at a minute. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='play.view.round', rung=3, title='Golfers and balls at a minute',
    purpose='Each golfer as a sprite (the drive through a swing, the walk, the address and idle), and each ball in the air.',
    requires=['Each golfer is a sprite: the drive clip through a swing, the walk while he moves, the address and idle poses otherwise (golf/play/view.ts header).'],
    files=['src/game/golf/play/view.ts'],
    dynamics=[],
    inputs=[], outputs=[],
    tests=['tests/golf-play-view.test.ts'],
    below=[], above=[], dual='none: a picture of the state',
    seams=['PlayPerson, PlayBall (view.ts)'], rules=['performance is a hard gate (the frame stays in budget)'],
    impl='describe',
)
