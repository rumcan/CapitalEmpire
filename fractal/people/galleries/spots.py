"""people.galleries.spots: Gallery spots (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='people.galleries.spots',
    rung=3,
    title='Gallery spots',
    purpose='Where the spectators stand: each green, tee, stand and tent is a spot with a pull and a room.',
    requires=["A green's spot has weight 3 and room 400; the last green has weight 5 and room 800 (golf/galleries.ts GALLERY).", 'An admitted party picks a spot by its weight and free room (pickSpot).'],
    files=['src/game/golf/galleries.ts'],
    dynamics=[
        Fn(name='gallerySpots', at='src/game/golf/galleries.ts:110', does='every gallery spot of the course', sig='(tees, pins, ...) => GallerySpot[]'),
        Fn(name='standingSpot', at='src/game/golf/galleries.ts:41', does='a standing place for a fan at a focus', sig='(f, x, y, focus, front?) => ...'),
        Fn(name='galleryPlaces', at='src/game/golf/galleries.ts:67', does='the places round a tee or a green', sig='(f, kind, c, u) => number[]'),
        Fn(name='pickSpot', at='src/game/golf/galleries.ts:148', does='picks a spot by weight and room', sig='(spots, fill, r, weights?) => number')],
    inputs=['the tees, the pins, the stands and tents'],
    outputs=['GallerySpot list; a picked index'],
    tests=['galleries.test.ts', 'event-seating.test.ts', 'gates.test.ts', 'golf-day-resume.test.ts'],
    below=['course', 'town'],
    above=['people.galleries.draw', 'people.crowd.view'],
    dual='derived: a spot is rebuilt from the course and its stands; a bulldozed stand takes its spot',
    seams=['WalkField'],
    rules=['performance is a hard gate'],
    impl='native',
    steer={'green': {'weight': 3, 'cap': 400, 'off': 7}, 'lastGreen': {'weight': 5, 'cap': 800}, 'tee': {'weight': 1.5, 'cap': 150, 'back': 3, 'off': 4}},
    port='todo: port gallerySpots (galleries.ts:110), standingSpot (:41), galleryPlaces (:67), pickSpot (:148); steer holds the GALLERY values (:23); stand and tent values are in the same table',
    fn=ported,
)
