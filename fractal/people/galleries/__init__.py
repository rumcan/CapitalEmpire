"""people.galleries: Where the spectators stand (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='people.galleries',
    rung=2,
    title='Where the spectators stand',
    purpose='The gallery spots (greens, tees, stands, tents) each draw fans by weight and room, and how many fans come each game minute.',
    requires=["A green's gallery spot has weight 3 and room 400; the last green weight 5 and room 800 (galleries.ts GALLERY).", 'Fans relocate every 30 game minutes (RELOCATE_EVERY, gallerydraw.ts:17).'],
    below=['course', 'business'],
    above=['people.crowd'],
    dual='derived: spots are rebuilt from the course and its stands',
    rules=['performance is a hard gate'],
)
