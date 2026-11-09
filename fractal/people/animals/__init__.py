"""people.animals: Farm animals (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='people.animals',
    rung=2,
    title='Farm animals',
    purpose='The cows, horses and sheep on the farms: their library frames, which herd a farm keeps, and how each wanders its field.',
    requires=['A farm keeps at most 16 animals (ANIMALS_PER_FARM_MAX, farms/animals.ts:36) and each animal stays in its field.', 'Each animal has 8 headings and 15 frames (ANIMAL_DIRS, ANIMAL_FRAMES).'],
    below=['art', 'town'],
    above=['town', 'render'],
    dual='derived from the farm layout; a changed field re-plans its herd',
    rules=['lit sprites are never mirrored'],
)
