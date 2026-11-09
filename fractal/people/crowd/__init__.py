"""people.crowd: Where the crowd stands, queues and walks (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='people.crowd',
    rung=2,
    title='Where the crowd stands, queues and walks',
    purpose='The spectators on the galleries, the queues at the gates and stops, the walking parties and the townspeople on the sidewalks.',
    requires=['A standing gallery draws at most 60 fans on plain ground, or 90 on a stand or along a place ring (crowdview.ts galleryPeople).', 'A queue shows at most 24 people (queuePeople) and a walking party at most 3 (walkerPeople).'],
    below=['people.identity', 'people.animation', 'play', 'business'],
    above=['render', 'people.galleries'],
    dual="the crowd is derived each frame; Crowd.save and Crowd.load restore a round's crowd",
    rules=['performance is a hard gate', "town jams are the player's job"],
)
