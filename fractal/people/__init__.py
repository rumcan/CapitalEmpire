"""people: the golfers, spectators, staff, animals, animation and crowds (T410 map; the ground truth is src/game/person*.ts, crowdview.ts, event/crowd.ts, golf/staff.ts, golf/crew*.ts, golf/galleries.ts, golf/gallerydraw.ts, ext/farms/animals.ts, ext/pedestrians/)."""
from fractal.holon import Holon

HOLON = Holon(
    id='people',
    rung=1,
    title='People',
    purpose='The golfers, spectators, staff, the grounds crew, farm animals, townspeople and the crowds: who each one is, how each looks and moves, and where each stands or walks.',
    requires=['Every person the game draws is a library picture of a people category or a person id, never a placeable prop (person.ts isPerson).', 'A lit person sprite is never mirrored: each of the eight facings is its own sheet row (pedestrians.ts FACING_ROW, all false).', 'Every crowd and walker is seeded, so the same spot keeps the same people and times from frame to frame (crowdview.ts hash).'],
    below=['render', 'art'],
    above=['play', 'town', 'course', 'business', 'ui'],
    dual='derived: people are drawn from state each frame; only hiring and staff pay change saved state',
    rules=['performance is a hard gate', 'lit sprites are never mirrored', 'sun upper right, shadows 145 degrees', "town jams are the player's job"],
    impl='describe',
)
