"""business.event: The event: stadium, round and crowd (T410). The event tool's stadium: where it goes, the round's stages, the surge of cars and buses, and the toll plaza."""
from fractal.holon import Holon

HOLON = Holon(
    id='business.event', rung=2, title='The event: stadium, round and crowd',
    purpose="The event tool's stadium: where it goes, the round's stages, the surge of cars and buses, and the toll plaza.",
    requires=['placeStadium finds a fully buildable site between the town centres, deterministically (event.test.ts).', 'The event round goes free, build, surge, eval and back to free (event.test.ts).'],
    below=['town', 'business.parking'], above=['ui', 'people'],
    dual=None, rules=[],
)
