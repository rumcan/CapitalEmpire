"""business.tournamentday: The tournament day (T410). One tournament day: its scoring, the calendar and timeline, the weather, the crowd from outside, and the town's growth."""
from fractal.holon import Holon

HOLON = Holon(
    id='business.tournamentday', rung=2, title='The tournament day',
    purpose="One tournament day: its scoring, the calendar and timeline, the weather, the crowd from outside, and the town's growth.",
    requires=['scoreTournamentDay computes DayFacts, daySatisfaction, reputationAfter and the money lines (golf-tournamentday.test.ts).', 'The day runs from 05:00, one game minute per sim second (golf/daytimeline.ts header).'],
    below=['business.tournaments', 'town', 'play'], above=['ui', 'people'],
    dual=None, rules=[],
)
