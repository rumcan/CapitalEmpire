"""ui.course.panels: Course panels (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.course.panels',
    rung=3,
    title='Course panels',
    purpose="The course's panels: the course panel, the props, buildings and practice panels, the hole strip and wizard, the OSM note and the real place card.",
    requires=["The hole strip lists the course's holes and adds one with newHole (HoleStrip.tsx:7).", 'The real place card shows a fetched course, and its dialog asks before it replaces the one you have (RealPlaceCard.tsx).'],
    files=['src/ui/course/CoursePanel.tsx', 'src/ui/course/PropsPanel.tsx', 'src/ui/course/BuildingsPanel.tsx', 'src/ui/course/PracticePanel.tsx', 'src/ui/course/HoleStrip.tsx', 'src/ui/course/HoleWizard.tsx', 'src/ui/course/OsmNote.tsx', 'src/ui/course/RealPlaceCard.tsx'],
    dynamics=[
        Fn(name='CoursePanel', at='src/ui/course/CoursePanel.tsx:31', does='the course panel', sig='({game, looks, onLooks}) => JSX'),
        Fn(name='HoleStrip', at='src/ui/course/HoleStrip.tsx:27', does='the strip of holes', sig='({game}) => JSX'),
        Fn(name='newHole', at='src/ui/course/HoleStrip.tsx:7', does='adds a hole', sig='(game) => ...'),
        Fn(name='HoleWizardPanel', at='src/ui/course/HoleWizard.tsx:29', does='the hole wizard panel', sig='({game}) => JSX'),
        Fn(name='RealPlaceDialog', at='src/ui/course/RealPlaceCard.tsx:40', does='the real place dialog', sig='({game}) => JSX')],
    inputs=['the game'],
    outputs=["the panel's clicks into the game"],
    tests=['ui-holes-panel.test.ts', 'ui-hole-play.test.ts', 'ui-osm-land.test.ts', 'practice-tools.test.ts'],
    below=['course', 'ui.tools'],
    above=['ui.rail'],
    dual="the Holes panel's undo arrows in its header (ToolHead.tsx header)",
    rules=['no flat colour washes'],
    impl='describe',
)
