"""play.flight.landfx: Landing effects. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='play.flight.landfx', rung=3, title='Landing effects',
    purpose='A splash where a ball goes into water (two rings and a jet), a puff in a bunker: canvas particles over the map.',
    requires=['A ball into water draws a splash: two rings and a jet, drawn on the map (golf/ballfx.ts header).'],
    files=['src/game/golf/ballfx.ts'],
    dynamics=[Fn(name='ballSplash', at='src/game/golf/ballfx.ts:12', does='draws the splash on the canvas', sig='(ctx, x, y, r, u, m, dpr)'),
        Fn(name='ballPuff', at='src/game/golf/ballfx.ts:30', does='draws the bunker puff', sig='(ctx, x, y, r, u, m)')],
    inputs=[], outputs=[],
    tests=['tests/golf-ball-roll.test.ts'],
    below=[], above=[], dual='the effect fades on its own (u runs 0 to 1); nothing to undo',
    seams=["the engine's drawBalls (canvas)"], rules=['performance is a hard gate (the frame stays in budget)'],
    impl='describe',
)
