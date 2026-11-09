"""play.clubs: The bag and the clubs (T410). The 14-club bag, its upgrades and fitted parts, the stats and mods that stack on a shot, the laser and the golfer's profile."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.clubs', rung=2, title='The bag and the clubs',
    purpose="The 14-club bag, its upgrades and fitted parts, the stats and mods that stack on a shot, the laser and the golfer's profile.",
    requires=["The bag holds 14 clubs, the 5-wood or the hybrid in the third wood's slot (golf-play-bag.test.ts).", 'A default bag applies no mods: the original clubs play as before (golf-play-bag.test.ts).'],
    below=['course'], above=['ui', 'business'],
    dual=None, rules=[],
)
