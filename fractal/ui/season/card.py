"""ui.season.card: The season card and the welcome (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='ui.season.card',
    rung=3,
    title='The season card and the welcome',
    purpose='The season card: where the year is, the founding checklist, the tournament plan and the course stats; and the welcome card.',
    requires=['The founding checklist lists nine holes, a car park and a clubhouse, each marked ok or not with a Fix (season.ts:17, SeasonCard header).', "A founding season's checklist turns to the season plan once founded (seasonPhase, season.ts:29)."],
    files=['src/ui/golf/SeasonCard.tsx', 'src/ui/golf/season.ts', 'src/ui/golf/WelcomeCard.tsx', 'src/game/golf/firstview.ts'],
    dynamics=[
        Fn(name='SeasonCard', at='src/ui/golf/SeasonCard.tsx:13', does='the season card', sig='({game, onClose, onSelectHole, canSkip}) => JSX'),
        Fn(name='foundingChecklist', at='src/ui/golf/season.ts:17', does='the founding checklist', sig='(c: InviteCheck) => CheckItem[]'),
        Fn(name='WelcomeCard', at='src/ui/golf/WelcomeCard.tsx:8', does='the welcome card', sig='({road, newHole, guide, onGo, ...}) => JSX')],
    inputs=['the season state and the invite check'],
    outputs=['the checklist and the Fix buttons'],
    tests=['season-card.test.ts'],
    below=['business', 'course'],
    above=['ui.rail'],
    dual='close the card (onClose); a Fix arms its tool',
    rules=["town jams are the player's job"],
    impl='native',
    steer={'fix_labels': {'holes': 'nine holes', 'carpark': 'a car park', 'clubhouse': 'a clubhouse'}},
    port='todo: port foundingChecklist (season.ts:17) and seasonPhase (:29) over the InviteCheck dict',
    fn=ported,
)
