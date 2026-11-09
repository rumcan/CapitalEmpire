"""ui.round.shot: The shot panel and the spin ball (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.round.shot',
    rung=3,
    title='The shot panel and the spin ball',
    purpose="The shot panel while the owner's shot is due, with the club, the swing meter and the spin ball.",
    requires=['The shot panel is open only while the shot is due, and the game is paused for it (ShotPanel header).', 'The spin ball puts the spin before the shot, and adds more in the air (SpinBall.tsx header).'],
    files=['src/ui/ShotPanel.tsx', 'src/ui/SpinBall.tsx'],
    dynamics=[
        Fn(name='ShotPanel', at='src/ui/ShotPanel.tsx:26', does='the shot panel', sig='({game}) => JSX'),
        Fn(name='SpinBall', at='src/ui/SpinBall.tsx:49', does='the spin ball', sig='({game, right}) => JSX')],
    inputs=["the game's shot view and spin view"],
    outputs=["the swing's clicks and the spin"],
    tests=['ui-shot-panel.test.ts', 'ui-cards-help.test.ts'],
    below=['play'],
    above=['ui.round.score'],
    dual='MISSING: a struck shot cannot be taken back from the panel',
    rules=['performance is a hard gate'],
    impl='describe',
)
