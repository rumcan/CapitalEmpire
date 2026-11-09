"""play.pace.pacer: Pacer caps at game speed. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.pace.pacer.json."""
from fractal.holon import Fn, Holon

STEER = {'speed': 1.0}

def cap_scale(*, knobs=None) -> float:
    """the cap factor at the game speed: 1 at 1x and faster, 1/speed below it (pacer.ts:28-30)"""
    k = {**STEER, **(knobs or {})}
    s = float(k["speed"])
    below1 = s if 0 < s < 1 else 1.0
    return 1 / below1


HOLON = Holon(
    id='play.pace.pacer', rung=3, title='Pacer caps at game speed',
    purpose='The caps the walkers and carts are held to, scaled when the game runs below 1x.',
    requires=['At 1x and faster the cap factor is 1; below 1x it is 1/speed (golf/play/pacer.ts:28-30).'],
    files=['src/game/golf/play/pacer.ts'],
    dynamics=[Fn(name='capScale', at='src/game/golf/play/pacer.ts:30', does='the cap factor at the game speed', sig='()'),
        Fn(name='setPaceSpeed', at='src/game/golf/play/pacer.ts:28', does='sets the game speed every pacer reads', sig='(k)')],
    inputs=[], outputs=[],
    tests=['tests/golf-pace.test.ts', 'tests/golf-watch-speed.test.ts'],
    below=[], above=[], dual='setPaceSpeed(1) puts the game back to 1x (golf/play/pacer.ts:28)',
    seams=["the game speed (core's sim tick)"], rules=[],
    impl='native',
    fn=cap_scale, params={}, steer=STEER, port='',
)
