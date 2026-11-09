"""business.tournaments: The tournament year (T410). The golf tournament over the year: the campaign of years, the year-end book and the multi-day tournament."""
from fractal.holon import Holon

HOLON = Holon(
    id='business.tournaments', rung=2, title='The tournament year',
    purpose='The golf tournament over the year: the campaign of years, the year-end book and the multi-day tournament.',
    requires=['A careful campaign reaches tier 3 within 8 years and stays solvent (golf-campaign.test.ts).', 'The year-end gives the tier progression and the reputation shift (golf/yearend.ts header).'],
    below=['business.career', 'play'], above=['ui', 'core'],
    dual=None, rules=[],
)
