"""ui.picker.places: Place and scene cards (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.picker.places',
    rung=3,
    title='Place and scene cards',
    purpose='The place card and the scene card that show a picked place or a picture of a scene.',
    requires=['A scene card shows its picture from the scene art (SceneCard sceneUrl, SceneCard.tsx:12).'],
    files=['src/ui/PlaceCard.tsx', 'src/ui/SceneCard.tsx', 'src/game/scenes.ts'],
    dynamics=[
        Fn(name='PlaceCard', at='src/ui/PlaceCard.tsx:8', does='the place card', sig='({view, onClose, right, onScen...}) => JSX'),
        Fn(name='SceneCard', at='src/ui/SceneCard.tsx:17', does='the scene card', sig='({view, onView, onClose, ...}) => JSX')],
    inputs=['a place or a scene view'],
    outputs=["the card's clicks"],
    tests=['scenes.test.ts'],
    below=['ui.panels.thumbs'],
    above=['ui.rail'],
    dual='close the card (onClose)',
    rules=['new art used everywhere'],
    impl='describe',
)
