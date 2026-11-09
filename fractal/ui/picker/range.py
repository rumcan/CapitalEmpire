"""ui.picker.range: The range card and its guide (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.picker.range',
    rung=3,
    title='The range card and its guide',
    purpose='The driving range card with its upgrades and the range guide, and the event card.',
    requires=['The range card lists each upgrade with its cost, its effect and a Build button (RangeCard header).', 'The range guide card explains the range once (RangeGuideCard.tsx).'],
    files=['src/ui/golf/RangeCard.tsx', 'src/ui/golf/RangeGuideCard.tsx', 'src/ui/golf/EventCard.tsx'],
    dynamics=[
        Fn(name='RangeCard', at='src/ui/golf/RangeCard.tsx:18', does='the range card', sig='({view, places, onPlace, onClose, ...}) => JSX'),
        Fn(name='RangeGuideCard', at='src/ui/golf/RangeGuideCard.tsx:12', does='the range guide', sig='({view, right, onShow, ...}) => JSX'),
        Fn(name='EventCard', at='src/ui/golf/EventCard.tsx:23', does='the event card', sig='({view, right, onClose, onEnter, ...}) => JSX')],
    inputs=['the range view'],
    outputs=['Build and place clicks'],
    tests=['golf-range-guide-card.test.ts', 'golf-range-guided.test.ts', 'ui-start-round.test.ts', 'ui-cards-card.test.ts'],
    below=['business', 'play'],
    above=['ui.rail'],
    dual='MISSING: a built range upgrade is not sold back from the card (it has Build only)',
    rules=['no flat colour washes'],
    impl='describe',
)
