"""business.tournamentday.weather: Weather. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.tournamentday.weather.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.tournamentday.weather', rung=3, title='Weather',
    purpose="The seeded tournament weather calendar and what a day's weather does to the day.",
    requires=['The tournament weather is seeded: weatherCalendar and getTournamentWeather give the same days for the same seed (golf/weather.ts:179, :190).'],
    files=['src/game/golf/weather.ts'],
    dynamics=[Fn(name='getTournamentWeather', at='src/game/golf/weather.ts:190', does='the weather of a tournament day', sig='(seed, yearOrRun, dayIndex=0, month)'),
        Fn(name='weatherCalendar', at='src/game/golf/weather.ts:179', does='the weather of every day of a tournament', sig='(seed, yearOrRun, days, month)'),
        Fn(name='applyWeatherToSatisfaction', at='src/game/golf/weather.ts:240', does='the satisfaction under a weather', sig='(base, condition)')],
    inputs=[], outputs=[],
    tests=['tests/golf-weather.test.ts'],
    below=[], above=[], dual='none: seeded and derived',
    seams=['WeatherCondition'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port weatherCalendar and getTournamentWeather (golf/weather.ts:179, :190)',
)
