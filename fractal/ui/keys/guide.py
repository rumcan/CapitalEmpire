"""ui.keys.guide: The guide's pulse and the progressive unlocks (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.keys.guide',
    rung=3,
    title="The guide's pulse and the progressive unlocks",
    purpose="The guide's ring that points at a control, and the tour and unlocks that bring the tools in as the player goes.",
    requires=['A pulse points at a control by its data-guide anchor, not screen coordinates (GuidePulse.tsx header).', 'Reduced motion shows a still ring (GuidePulse.tsx header).'],
    files=['src/ui/GuidePulse.tsx', 'src/game/ext/progressive-ui/guide.ts', 'src/game/ext/progressive-ui/index.ts', 'src/game/ext/progressive-ui/progress.ts', 'src/game/ext/progressive-ui/tour.ts', 'src/game/ext/progressive-ui/transport.ts'],
    dynamics=[
        Fn(name='GuidePulse', at='src/ui/GuidePulse.tsx:23', does='the pulse ring over an anchor', sig='({anchor}) => JSX'),
        Fn(name='anchorElement', at='src/ui/GuidePulse.tsx:14', does='the first visible element of an anchor', sig='(id, doc) => Element | null'),
        Fn(name='progressive-ui', at='src/game/ext/progressive-ui/index.ts', does='the unlock state the rail and keys read', sig='ProgressiveUiState')],
    inputs=["a guide anchor id; the game's progress"],
    outputs=['a ring over a control; unlock state'],
    tests=['season-card.test.ts', 'ui-menu-fixes.test.ts', 'ui-rail.test.ts', 'ext-progressive-guide.test.ts', 'ext-progressive-ui.test.ts'],
    below=['core'],
    above=['ui.rail.items'],
    dual='the pulse ends after its time; the tour can be skipped',
    rules=['no flat colour washes'],
    impl='describe',
)
