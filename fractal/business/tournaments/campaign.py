"""business.tournaments.campaign: Campaign simulation. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.tournaments.campaign.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.tournaments.campaign', rung=3, title='Campaign simulation',
    purpose="The multi-year campaign: a strategy's years, tiers and money, as a simulation.",
    requires=['A careful strategy reaches tier 3 within 8 years and stays solvent; a careless one never passes tier 1 (golf-campaign.test.ts).'],
    files=['src/game/golf/campaign.ts'],
    dynamics=[Fn(name='simulateCampaign', at='src/game/golf/campaign.ts:65', does="simulates the campaign's years for an options set", sig='(opts)')],
    inputs=[], outputs=[],
    tests=['tests/golf-campaign.test.ts', 'tests/golf-balance-income.test.ts'],
    below=[], above=[], dual='none: a simulation',
    seams=['CampaignOptions'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port simulateCampaign (golf/campaign.ts:65)',
)
