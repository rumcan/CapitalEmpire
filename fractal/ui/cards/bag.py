"""ui.cards.bag: Your bag and ball room (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.cards.bag',
    rung=3,
    title='Your bag and ball room',
    purpose="The bag card, the ball room's upgrade tree, and the club icons.",
    requires=['The ball room tree offers buying only: a node is bought with onBuy, and nothing sells it back (BallTree.tsx props).', "A club's icon takes its level's colour (ClubIcon.tsx LEVEL_COLOR)."],
    files=['src/ui/golf/BagCard.tsx', 'src/ui/golf/BallTree.tsx', 'src/ui/golf/ClubIcon.tsx'],
    dynamics=[
        Fn(name='BagCard', at='src/ui/golf/BagCard.tsx:122', does='the bag card', sig='({view, onClose, onUpgrade, ...}) => JSX'),
        Fn(name='BallTree', at='src/ui/golf/BallTree.tsx:22', does='the ball room tree', sig='({view, onBuy, onClose, ...}) => JSX'),
        Fn(name='ClubIcon', at='src/ui/golf/ClubIcon.tsx:9', does="a club's icon", sig='({club, level, size}) => JSX')],
    inputs=['the bag view'],
    outputs=['upgrade and buy clicks'],
    tests=['ui-bag-card.test.ts'],
    below=['play', 'business'],
    above=['ui.cards.collection'],
    dual='MISSING: a bought ball room node cannot be sold back (BallTree has onBuy only)',
    rules=['new art used everywhere'],
    impl='describe',
)
