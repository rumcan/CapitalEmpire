"""ui.course.stats: Course stats (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.course.stats',
    rung=3,
    title='Course stats',
    purpose='The course stats card and its number formats: money, hole lengths in metres and yards, par colours and the quality badge.',
    requires=['formatHoleLength gives the length in metres and yards (coursestatsFormat.ts:12).', 'formatCurrency gives the money in the locale of the page (coursestatsFormat.ts:4).'],
    files=['src/ui/CourseStatsPanel.tsx', 'src/ui/coursestatsFormat.ts'],
    dynamics=[
        Fn(name='CourseStatsPanel', at='src/ui/CourseStatsPanel.tsx:18', does='the course stats card', sig='({stats, onClose, onSelectHole, ...}) => JSX'),
        Fn(name='formatHoleLength', at='src/ui/coursestatsFormat.ts:12', does="a hole's length in metres and yards", sig='(m: number, yd: number) => string')],
    inputs=['the course stats'],
    outputs=['formatted text and badge classes'],
    tests=['ui-coursestats.test.ts', 'golf-coursestats.test.ts'],
    below=['course'],
    above=['ui.rail'],
    dual='derived; close the card (onClose)',
    rules=['no flat colour washes'],
    impl='describe',
)
