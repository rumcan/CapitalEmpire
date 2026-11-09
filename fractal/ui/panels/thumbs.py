"""ui.panels.thumbs: Thumbnails and icons (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.panels.thumbs',
    rung=3,
    title='Thumbnails and icons',
    purpose='The library thumbnails drawn once from the full-resolution master, the visibility gate, and the icon.',
    requires=["A thumbnail is drawn from its picture's full-resolution master when the repo has one, else the atlas mip (thumb-source.ts header).", 'A thumbnail is drawn once the card is visible (onceVisible, thumb-visibility.ts:2).'],
    files=['src/ui/Thumb.tsx', 'src/ui/thumb-source.ts', 'src/ui/thumb-visibility.ts', 'src/ui/Icon.tsx'],
    dynamics=[
        Fn(name='Thumb', at='src/ui/Thumb.tsx:55', does="a library picture's thumbnail", sig='({it, size, flip}) => JSX'),
        Fn(name='thumbSource', at='src/ui/thumb-source.ts:42', does='where a thumbnail is drawn from', sig='(it, urls) => ThumbSource'),
        Fn(name='onceVisible', at='src/ui/thumb-visibility.ts:2', does='calls reveal once the target is seen', sig='(target, reveal, Observer?) => ...'),
        Fn(name='Icon', at='src/ui/Icon.tsx:14', does='an icon', sig='({name, size, className}) => JSX')],
    inputs=['a library item; the size'],
    outputs=['a thumbnail source and its drawn picture'],
    tests=['props-variety.test.ts'],
    below=['art'],
    above=['ui.picker.places', 'ui.cards.collection'],
    dual='derived; nothing to undo',
    rules=['new art used everywhere', 'no visible tiling'],
    impl='describe',
)
