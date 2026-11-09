"""ui.season.report: The season report (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.season.report',
    rung=3,
    title='The season report',
    purpose='The season report card that closes a season and carries the player to the next one.',
    requires=["The season report card shows the year's result and a Continue (SeasonReportCard.tsx:11)."],
    files=['src/ui/golf/SeasonReportCard.tsx'],
    dynamics=[
        Fn(name='SeasonReportCard', at='src/ui/golf/SeasonReportCard.tsx:11', does='the season report', sig='({report, onContinue}) => JSX')],
    inputs=['the season report'],
    outputs=['Continue'],
    tests=['season-card.test.ts'],
    below=['business'],
    above=['ui.season.card'],
    dual="not checked: no undo of Continue was read in SeasonReportCard.tsx; treat as a question",
    rules=["town jams are the player's job"],
    impl='describe',
)
