"""ui.panels.results: Results, the leaderboard and grade (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.panels.results',
    rung=3,
    title='Results, the leaderboard and grade',
    purpose='The tournament results, the golf leaderboard and the grade panel.',
    requires=["formatResultMoney prints a result's money; satisfactionBadge gives the badge for a score (TournamentResults.tsx:7, :21).", 'The leaderboard reads the live standings (GolfLeaderboard.tsx).'],
    files=['src/ui/TournamentResults.tsx', 'src/ui/GolfLeaderboard.tsx', 'src/ui/GradePanel.tsx'],
    dynamics=[
        Fn(name='TournamentResults', at='src/ui/TournamentResults.tsx:46', does='the tournament results', sig='(props) => JSX'),
        Fn(name='satisfactionBadge', at='src/ui/TournamentResults.tsx:21', does='the satisfaction badge', sig='(score) => {label, ...}'),
        Fn(name='GolfLeaderboard', at='src/ui/GolfLeaderboard.tsx:20', does='the leaderboard', sig='({game}) => JSX'),
        Fn(name='GradePanel', at='src/ui/GradePanel.tsx:6', does='the grade panel', sig='({game, bump}) => JSX')],
    inputs=['the tournament and the standings'],
    outputs=['the results view'],
    tests=['ui-results.test.ts', 'grade.test.ts'],
    below=['business'],
    above=['ui.rail'],
    dual='derived; nothing to undo',
    rules=['no flat colour washes'],
    impl='describe',
)
