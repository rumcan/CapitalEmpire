"""ui.picker: Course picker, holes, range and places (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.picker',
    rung=2,
    title='Course picker, holes, range and places',
    purpose='Your course picker, the hole card and tee sets, the range card, and the place and scene cards.',
    requires=['Build your own stays first; the shipped courses are Featured; a pick fetches with one Overpass query (CoursePicker header).', 'A hole always keeps its last tee: the last one cannot be removed (TeeSets.tsx, disabled).'],
    below=['course', 'business', 'play'],
    above=['ui.rail'],
    dual='Delete removes a downloaded course; Remove takes a tee out',
    rules=['new art used everywhere'],
)
