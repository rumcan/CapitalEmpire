"""ui.course.brushes: Brushes, swatches and the grass editor (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.course.brushes',
    rung=3,
    title='Brushes, swatches and the grass editor',
    purpose='The brush controls, surface swatches and the grass and bunker editors that paint with a look.',
    requires=["A surface swatch shows the brush's real look (swatch-puck.ts puckLookOf).", 'Mowing lines show on the brush that mows (MowingLines.tsx, hasMowing).'],
    files=['src/ui/course/BrushControls.tsx', 'src/ui/course/CourseEdges.tsx', 'src/ui/course/GrassEditor.tsx', 'src/ui/course/MowingLines.tsx', 'src/ui/course/MyLooks.tsx', 'src/ui/course/SurfaceFocus.tsx', 'src/ui/course/SurfaceMark.tsx', 'src/ui/course/swatch-puck.ts', 'src/ui/GrassManagementPanel.tsx', 'src/ui/BunkerSettings.tsx'],
    dynamics=[
        Fn(name='SurfaceSwatches', at='src/ui/course/BrushControls.tsx:53', does='the surface swatches', sig='({game, on, pick, pickGrass}) => JSX'),
        Fn(name='useSwatchPucks', at='src/ui/course/swatch-puck.ts:54', does='the swatch pucks, redrawn when the look changes', sig='() => number'),
        Fn(name='GrassCard', at='src/ui/course/GrassEditor.tsx:43', does='the grass editor card', sig='({game, onClose}) => JSX'),
        Fn(name='MowingLines', at='src/ui/course/MowingLines.tsx:33', does='the mowing lines of a brush', sig='({game, kind}) => JSX'),
        Fn(name='BunkerLookShape', at='src/ui/BunkerSettings.tsx:118', does="the bunker look's shape control", sig='({game}) => JSX')],
    inputs=["the game's brushes and looks"],
    outputs=['brush picks into the game'],
    tests=['plant-brush-panel.test.ts', 'mowing-lines.test.ts', 'surface-flyout-open.test.ts', 'golf-greenkeeping.test.ts', 'ext-bunker-settings.test.ts'],
    below=['course', 'ui.tools.paint'],
    above=['ui.rail'],
    dual='a slider drag is one undo step (setting-hold.ts)',
    rules=['no flat colour washes', 'new art used everywhere'],
    impl='describe',
)
