"""ui.panels.view: Minimap, road thumb and night panel (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.panels.view',
    rung=3,
    title='Minimap, road thumb and night panel',
    purpose='The bottom-left minimap of the whole map, the road thumb and the night panel.',
    requires=["The minimap's base picture is rebuilt only when roads, the valley, lots or the pixel ratio change (Minimap.tsx header).", 'The view box on the minimap is redrawn only when the camera moves (Minimap.tsx header).'],
    files=['src/ui/Minimap.tsx', 'src/ui/RoadThumb.tsx', 'src/ui/NightPanel.tsx'],
    dynamics=[
        Fn(name='Minimap', at='src/ui/Minimap.tsx:58', does='the minimap', sig='({game}) => JSX'),
        Fn(name='RoadThumb', at='src/ui/RoadThumb.tsx:10', does='a road class thumbnail', sig='({cls, w, h}) => JSX'),
        Fn(name='NightPanel', at='src/ui/NightPanel.tsx:21', does='the night panel', sig='({game, bump}) => JSX')],
    inputs=["the game's map and camera"],
    outputs=['a canvas picture'],
    tests=['water-glint.test.ts'],
    below=['render', 'town'],
    above=['ui.rail'],
    dual='derived each frame; nothing to undo',
    rules=['performance is a hard gate'],
    impl='describe',
)
