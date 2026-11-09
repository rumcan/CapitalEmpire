"""ui.club.clubhouse: The clubhouse card and the club title (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='ui.club.clubhouse',
    rung=3,
    title='The clubhouse card and the club title',
    purpose="The clubhouse card: the members, the visitors, the fees taken, and the club's title.",
    requires=['membersHeadline gives the members, the month and the pool of the club (club-members.ts:12).', "The club title's words come in at TITLE_WORDS_FROM 1900 and TITLE_FULL_FROM 2560 (ClubTitle.tsx:10, :12)."],
    files=['src/ui/golf/ClubhouseCard.tsx', 'src/ui/golf/club-members.ts', 'src/ui/ClubTitle.tsx', 'src/game/golf/clubtitle.ts'],
    dynamics=[
        Fn(name='ClubhouseCard', at='src/ui/golf/ClubhouseCard.tsx:20', does='the clubhouse card', sig='({view, onClose, onStaff, ...}) => JSX'),
        Fn(name='membersHeadline', at='src/ui/golf/club-members.ts:12', does='the members headline', sig='(v: MembersView) => {members, month, pool, net}'),
        Fn(name='ClubTitleText', at='src/ui/ClubTitle.tsx:14', does='the club title', sig='({title}) => JSX')],
    inputs=["the club's members view"],
    outputs=['the headline numbers and the card'],
    tests=['ui-club-card.test.ts', 'ui-club-title.test.ts'],
    below=['business'],
    above=['ui.rail'],
    dual='derived each frame; close the card (onClose)',
    rules=['no flat colour washes'],
    impl='native',
    steer={'bar_span': [0.5, 1.5], 'title_full_from': 2560, 'title_words_from': 1900},
    port='todo: port membersHeadline (club-members.ts:12), priceSteps (:22) and bandBar (:29) over the MembersView dict',
    fn=ported,
)
