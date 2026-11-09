"""play.ai.entourage: Caddies and carts. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.ai.entourage.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.ai.entourage', rung=3, title='Caddies and carts',
    purpose='Who rides a cart and who has a caddie: pros with caddies at the pro tiers, amateurs two to a cart.',
    requires=['Caddies walk with the pros at the pro tiers; amateurs at the small events ride two to a cart (golf-play-entourage.test.ts).'],
    files=['src/game/golf/play/entourage.ts'],
    dynamics=[Fn(name='fieldEntourage', at='src/game/golf/play/entourage.ts:42', does="sets the field's caddies and carts for a tier", sig='(golfers, groups, tier)'),
        Fn(name='dayEntourage', at='src/game/golf/play/entourage.ts:50', does="sets the everyday day's carts", sig='(golfers, groups, member, seed)'),
        Fn(name='pairCarts', at='src/game/golf/play/entourage.ts:24', does='pairs golfers into carts', sig='(golfers, groups, rides)')],
    inputs=[], outputs=[],
    tests=['tests/golf-play-entourage.test.ts'],
    below=[], above=[], dual='none: recomputed each day',
    seams=['Golfer.cart / caddie'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port pairCarts, fieldEntourage (golf/play/entourage.ts:24, :42)',
)
