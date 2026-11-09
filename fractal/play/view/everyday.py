"""play.view.everyday: Everyday car park view. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='play.view.everyday', rung=3, title='Everyday car park view',
    purpose="Each everyday group's car drives in from the car park entrance and parks; its golfers walk to the clubhouse door.",
    requires=["Each group's car drives in from the car park's entrance and parks; its golfers walk to the clubhouse's door (golf/everydayview.ts header)."],
    files=['src/game/golf/everydayview.ts'],
    dynamics=[Fn(name='polyAt', at='src/game/golf/everydayview.ts:40', does='a point along a route at fraction u', sig='(pts, u)')],
    inputs=[], outputs=[],
    tests=['tests/golf-everyday-continuity.test.ts', 'tests/golf-everyday.test.ts'],
    below=[], above=[], dual='none: derived each time',
    seams=['DayPlan'], rules=[],
    impl='describe',
)
