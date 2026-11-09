"""ui.season: The season and its report (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.season',
    rung=2,
    title='The season and its report',
    purpose='The season card with the founding checklist, the welcome, and the season report.',
    requires=['The founding checklist is nine holes, a car park and a clubhouse, each marked ok or not with a Fix (SeasonCard header).', 'The welcome card opens a new game (WelcomeCard).'],
    below=['business', 'course'],
    above=['ui.rail'],
    dual="close the card (onClose); the checklist's Fix arms its tool",
    rules=["town jams are the player's job"],
)
