"""business: Money, career and tournaments (T410, issue 1110). The money (budget, costs, sponsors), the career and its tiers, the tournament year and its day, the event tool and its stadium, car parks, the facilities, the businesses and the range economy."""
from fractal.holon import Holon

HOLON = Holon(
    id='business', rung=1, title='Money, career and tournaments',
    purpose='The money (budget, costs, sponsors), the career and its tiers, the tournament year and its day, the event tool and its stadium, car parks, the facilities, the businesses and the range economy.',
    requires=['The treasury moves only through the ledger: a grant or a toll goes in now and shows in the next ledger (budget.test.ts).', 'Milestones never un-reach: the career keeps the highest milestone reached (src/game/career.ts:55).', 'A new range has 4 bays, $6 and nothing bought (golf-rangebiz.test.ts).'],
    below=['town', 'land', 'course', 'play'], above=['ui', 'core'],
    rules=['performance is a hard gate (the frame stays in budget)', "town jams are the player's job (never auto-fix congestion)"],
)
