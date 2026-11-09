"""business.range.scene: Range scene. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='business.range.scene', rung=3, title='Range scene',
    purpose="The range's scene for the map: the bays, the mats and greens, the fences, the cars and the shop.",
    requires=['The scene is inside the plot for every facing, and its keys are unique (golf-rangebiz.test.ts).'],
    files=['src/game/golf/rangebiz.ts'],
    dynamics=[Fn(name='rangeScene', at='src/game/golf/rangebiz.ts:228', does='the range scene for a plot, facing and save', sig='(plot, facing, s, opts)'),
        Fn(name='rangeTakes', at='src/game/golf/rangebiz.ts:565', does='the take-away lots of a range', sig='(plot, facing)')],
    inputs=[], outputs=[],
    tests=['tests/golf-rangebiz.test.ts', 'tests/golf-range-look.test.ts'],
    below=[], above=[], dual='none: derived from the save each time',
    seams=['RangeScene'], rules=['performance is a hard gate (the frame stays in budget)'],
    impl='describe',
)
