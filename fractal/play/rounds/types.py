"""play.rounds.types: Round types and re-exports. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='play.rounds.types', rung=3, title='Round types and re-exports',
    purpose="The round's contract types and the play module's re-exports.",
    requires=['Times are game minutes of the tournament day; distances are tiles unless a name says metres (golf/play/types.ts header).'],
    files=['src/game/golf/play/types.ts', 'src/game/golf/play/index.ts'],
    dynamics=[],
    inputs=[], outputs=[],
    tests=['tests/golf-play.test.ts'],
    below=[], above=[], dual='none: types only',
    seams=['RoundPlan, Golfer, Group, Shot, Standing'], rules=[],
    impl='describe',
)
