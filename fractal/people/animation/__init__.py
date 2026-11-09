"""people.animation: How a person moves and faces (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='people.animation',
    rung=2,
    title='How a person moves and faces',
    purpose='The eight facings and the clip timing that give each person its frame.',
    requires=['There are eight facings in FACINGS order (S SW W NW N NE E SE), each its own sheet row, and none is mirrored.', 'A clip is a run of its sheet row (start, n): a loop wraps, a one-shot holds its last frame.'],
    below=['art'],
    above=['crowd', 'animals', 'staff'],
    dual='derived each frame; nothing to undo',
    rules=['lit sprites are never mirrored', 'straight views turned 8 degrees'],
)
