"""play.pace.watch: Watching speed label. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.pace.watch.json."""
from fractal.holon import Fn, Holon

STEER = {}

def speed_label(*, k: float, knobs=None) -> str:
    """a game speed as text: below 1x it reads 1/n (watch.ts:14)"""
    if 0 < k < 1:
        return f"1/{int(1 / k + 0.5)}"
    return str(int(k)) if float(k).is_integer() else str(k)


HOLON = Holon(
    id='play.pace.watch', rung=3, title='Watching speed label',
    purpose='A game speed as the speed bar reads it: below 1x as 1/n.',
    requires=['speedLabel shows a speed below 1x as 1/n (golf/watch.ts:14).'],
    files=['src/game/golf/watch.ts'],
    dynamics=[Fn(name='speedLabel', at='src/game/golf/watch.ts:14', does='the label for a game speed', sig='(k)')],
    inputs=[], outputs=[],
    tests=['tests/golf-watch-speed.test.ts'],
    below=[], above=[], dual='none: a label',
    seams=['the speed bar (ui)'], rules=[],
    impl='native',
    fn=speed_label, params={}, steer=STEER, port='',
)
