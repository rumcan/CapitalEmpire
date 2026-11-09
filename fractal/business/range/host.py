"""business.range.host: Range host scene. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='business.range.host', rung=3, title='Range host scene',
    purpose="The engine's side of the range: its ground patches, its auto props and its cart paths, laid on the map.",
    requires=["The range's scene is laid on the map: ground patches, auto props, and once, cart paths (golf/rangehost.ts header)."],
    files=['src/game/golf/rangehost.ts'],
    dynamics=[Fn(name='outfieldStripes', at='src/game/golf/rangehost.ts:102', does="the outfield's mown stripes", sig='(sc, s)')],
    inputs=[], outputs=[],
    tests=['tests/golf-range-look.test.ts', 'tests/golf-range-ramp.test.ts', 'tests/golf-range-desert.test.ts'],
    below=[], above=[], dual='none: derived each time',
    seams=['RangeScene (rangebiz)'], rules=['performance is a hard gate (the frame stays in budget)'],
    impl='describe',
)
