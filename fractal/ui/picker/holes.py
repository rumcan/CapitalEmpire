"""ui.picker.holes: The hole card, tee sets and the land panel (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.picker.holes',
    rung=3,
    title='The hole card, tee sets and the land panel',
    purpose='The hole card with its checks and Fixes, the tee sets and their edit, and the land panel.',
    requires=['A hole keeps its last tee: the last one cannot be removed (TeeSets.tsx, disabled and titled).', "The hole card's checks each have the Fix that arms the tool that mends them (HoleCard header)."],
    files=['src/ui/golf/HoleCard.tsx', 'src/ui/golf/TeeSets.tsx', 'src/ui/golf/LandPanel.tsx', 'src/game/golf/holecard.ts'],
    dynamics=[
        Fn(name='HoleCard', at='src/ui/golf/HoleCard.tsx:27', does='the hole card', sig='({game, right}) => JSX'),
        Fn(name='HolePlayChoice', at='src/ui/golf/HoleCard.tsx:178', does='the choice of hole to play', sig='({n, count, onHole, ...}) => JSX'),
        Fn(name='TeeSetRows', at='src/ui/golf/TeeSets.tsx:16', does='the rows of tee sets', sig='({game, n, tees, addable}) => JSX'),
        Fn(name='EditTees', at='src/ui/golf/TeeSets.tsx:48', does='the tee editor', sig='({game, n}) => JSX')],
    inputs=['the hole and its tees'],
    outputs=['the Fix and the tee clicks'],
    tests=['ui-hole-play.test.ts', 'ui-holes-panel.test.ts', 'golf-tee-sets.test.ts', 'golf-hole-card.test.ts'],
    below=['course'],
    above=['ui.rail'],
    dual='removeTeeSet takes a tee out; placing the set again puts it back',
    rules=['no flat colour washes'],
    impl='describe',
)
